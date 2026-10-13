import test from 'node:test';
import assert from 'node:assert/strict';
import { R2Store } from '../cloud/store.js';
import { createWorker } from '../cloud/worker.js';
import { createProject } from '../web/core/model.js';

class FakeR2 {
 objects = new Map(); sequence = 0; pageSize = 100;
 async get(key) {
  const object = this.objects.get(key);
  return object ? { ...object, text: async () => object.body } : null;
 }
 async put(key, body, options = {}) {
  const current = this.objects.get(key), condition = options.onlyIf;
  if (condition?.etagMatches && current?.etag !== condition.etagMatches || condition?.etagDoesNotMatch === '*' && current) return null;
  const object = { key, body, size: new TextEncoder().encode(body).length, etag: `etag-${++this.sequence}`, customMetadata: options.customMetadata };
  this.objects.set(key, object);
  return object;
 }
 async list({ prefix, limit, cursor }) {
  const all = [...this.objects.values()].filter(o => o.key.startsWith(prefix)).sort((a,b) => a.key.localeCompare(b.key));
  const start = Number(cursor || 0), end = start + Math.min(limit, this.pageSize);
  return { objects: all.slice(start, end), truncated: all.length > end, ...(all.length > end ? { cursor: String(end) } : {}) };
 }
}
const project = () => createProject('blank', 'web');
const errorCode = code => error => error.code === code;

test('R2 tenant isolation hashes identity and checks exact identifiers', async () => {
 const bucket = new FakeR2(), alice = await R2Store.create(bucket, 'private-alice'), bob = await R2Store.create(bucket, 'private-bob');
 const record = await alice.create(project());
 assert.equal((await alice.get(record.id)).revision, 1);
 await assert.rejects(bob.get(record.id), errorCode('NOT_FOUND'));
 assert.deepEqual(await bob.list(), []);
 assert.ok(![...bucket.objects.keys()][0].includes('private-alice'));
 await assert.rejects(alice.get('../other.json'), errorCode('INVALID_ARGUMENT'));
 await assert.rejects(R2Store.create(bucket, ''), errorCode('UNAUTHORIZED'));
});

test('R2 concurrent writes have one winner and stale writes fail', async () => {
 const bucket = new FakeR2(), store = await R2Store.create(bucket, 'alice');
 const original = await store.create(project());
 const outcomes = await Promise.allSettled([store.update(original.id, 1, project()), store.update(original.id, 1, project())]);
 assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
 assert.equal(outcomes.find(r => r.status === 'rejected').reason.code, 'CONFLICT');
 assert.equal((await store.get(original.id)).revision, 2);
 await assert.rejects(store.update(original.id, 1, project()), errorCode('CONFLICT'));
 await assert.rejects(store.update(original.id, 2, { version: 99 }), /./);
 assert.equal((await store.get(original.id)).revision, 2);
});

test('R2 deletion removes project data and prevents an in-flight update resurrection', async () => {
 const bucket = new FakeR2(), store = await R2Store.create(bucket, 'alice');
 const record = await store.create(project()), stale = await store.read(record.id);
 await store.delete(record.id, 1);
 await assert.rejects(store.put({ ...record, revision: 2 }, { etagMatches: stale.etag }), errorCode('CONFLICT'));
 await assert.rejects(store.get(record.id), errorCode('NOT_FOUND'));
 assert.deepEqual(await store.list(), []);
 const tombstone = JSON.parse(bucket.objects.get(store.key(record.id)).body);
 assert.equal(tombstone.deleted, true);
 assert.equal(Object.hasOwn(tombstone, 'project'), false);
});

test('R2 follows bounded pagination without silently dropping projects', async () => {
 const bucket = new FakeR2(); bucket.pageSize = 1;
 const store = await R2Store.create(bucket, 'alice');
 await store.create(project()); await store.create(project());
 assert.equal((await store.list()).length, 2);
 bucket.list = async () => ({ objects: [], truncated: true, cursor: 'same' });
 await assert.rejects(store.list(), errorCode('INVALID_STORE'));
});

function client(worker, env, method, params, identity, options = {}) {
 return worker.fetch(new Request('https://rash.example/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(identity ? { 'oai-authenticated-user-id': identity } : {}), ...options.headers },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), ...options
 }), env);
}

test('HTTP discovery and UI resource expose no tenant data; private calls require auth', async () => {
 const worker = createWorker({ readUI: async () => '<html>studio</html>' }), env = { RASH_PROJECTS: new FakeR2() };
 const tools = await client(worker, env, 'tools/list', {});
 assert.equal(tools.status, 200); assert.ok((await tools.json()).result.tools.length > 0);
 const ui = await client(worker, env, 'resources/read', { uri: 'ui://rash/animation.html' });
 assert.equal((await ui.json()).result.contents[0].text, '<html>studio</html>');
 assert.equal((await client(worker, env, 'resources/list', {})).status, 401);
 assert.equal((await client(worker, env, 'tools/call', { name: 'rash_project_list' })).status, 401);
 assert.equal((await client(worker, env, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).status, 200);
});

test('HTTP project lifecycle enforces tenant and revision boundaries', async () => {
 const worker = createWorker(), env = { RASH_PROJECTS: new FakeR2() };
 const call = async (name, args, user = 'alice') => (await (await client(worker, env, 'tools/call', { name, arguments: args }, user)).json()).result;
 const created = (await call('rash_project_create', {})).structuredContent;
 assert.equal(created.revision, 1);
 assert.equal((await call('rash_project_get', { id: created.id }, 'bob')).isError, true);
 const edited = structuredClone(created.project); edited.name = 'Edited';
 assert.equal((await call('rash_project_update', { id: created.id, expectedRevision: 1, project: edited })).structuredContent.revision, 2);
 assert.equal((await call('rash_render', { id: created.id, revision: 1 })).structuredContent.error.code, 'CONFLICT');
 assert.match((await call('rash_export', { id: created.id, revision: 2, format: 'svg' })).structuredContent.data, /<svg/);
 assert.equal((await call('rash_project_delete', { id: created.id, expectedRevision: 2 })).structuredContent.deleted, true);
 assert.deepEqual((await call('rash_project_list', {})).structuredContent.projects, []);
});

test('HTTP rejects hostile origins, unsupported methods, invalid and oversized bodies', async () => {
 const worker = createWorker(), env = { RASH_PROJECTS: new FakeR2() };
 const request = (init) => worker.fetch(new Request('https://rash.example/mcp', init), env);
 assert.equal((await request({ method: 'GET' })).status, 405);
 assert.equal((await request({ method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status, 403);
 assert.equal((await request({ method: 'POST', body: '{}' })).status, 415);
 assert.equal((await request({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
 assert.equal((await request({ method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(5_000_001) })).status, 413);
 const notification = await request({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://chatgpt.com' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
 assert.equal(notification.status, 202); assert.equal(await notification.text(), '');
 assert.equal(notification.headers.get('access-control-allow-origin'), null);
});

test('private dashboard requires verified identity and supplies restrictive page headers', async () => {
 const worker = createWorker({ readPage: async () => '<html>Private dashboard</html>' });
 const anonymous = await worker.fetch(new Request('https://rash.example/'), {});
 assert.equal(anonymous.status, 401);
 const page = await worker.fetch(new Request('https://rash.example/', { headers: { 'oai-authenticated-user-id': 'alice' } }), {});
 assert.equal(page.status, 200);
 assert.match(page.headers.get('content-type'), /^text\/html/);
 assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
 assert.equal(page.headers.get('cache-control'), 'no-store');
 assert.match(await page.text(), /Private dashboard/);
});
