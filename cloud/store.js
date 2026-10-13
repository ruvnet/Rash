import { checkedProject, MAX_PROJECT_BYTES, RashError } from '../mcp/service.js';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_RECORD_BYTES = MAX_PROJECT_BYTES + 4096;
const fail = (code, message) => { throw new RashError(code, message); };
export class R2Store {
 static async create(bucket, identity) {
  if (typeof identity !== 'string' || !identity.trim() || identity.length > 512) fail('UNAUTHORIZED', 'Authenticated identity required');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const tenant = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return new R2Store(bucket, `rash/v1/${tenant}/`);
 }
 constructor(bucket, prefix) { this.bucket = bucket; this.prefix = prefix; }
 key(id) {
  if (typeof id !== 'string' || !UUID.test(id)) fail('INVALID_ARGUMENT', 'Invalid project id');
  return `${this.prefix}${id}.json`;
 }
 async read(id) {
  const object = await this.bucket.get(this.key(id));
  if (!object) fail('NOT_FOUND', 'Project not found');
  if (!Number.isSafeInteger(object.size) || object.size > MAX_RECORD_BYTES) fail('LIMIT', 'Stored project exceeds limit');
  let record;
  try { record = JSON.parse(await object.text()); } catch { fail('INVALID_STORE', 'Project record cannot be read'); }
  if (record.id !== id || !Number.isSafeInteger(record.revision) || record.revision < 1 || typeof record.updatedAt !== 'string') fail('INVALID_STORE', 'Invalid project record');
  if (record.deleted) fail('NOT_FOUND', 'Project not found');
  record.project = checkedProject(record.project);
  return { record, etag: object.etag };
 }
 async get(id) { return (await this.read(id)).record; }
 async list() {
  const result = [];
  let cursor;
  // Never return an apparently complete list after silently truncating it.
  for (let page = 0; page < 10; page++) {
   const batch = await this.bucket.list({ prefix: this.prefix, limit: 100, ...(cursor ? { cursor } : {}), include: ['customMetadata'] });
   for (const object of batch.objects) {
    const id = object.key.slice(this.prefix.length, -5);
    if (!object.key.startsWith(this.prefix) || !object.key.endsWith('.json') || !UUID.test(id)) continue;
    if (object.customMetadata?.deleted === 'true') continue;
    // Read the authoritative record; listing metadata is only a tombstone optimization.
    let record;
    try { record = await this.get(id); } catch (error) { if (error.code === 'NOT_FOUND') continue; throw error; }
    result.push({ id, revision: record.revision, updatedAt: record.updatedAt, name: record.project.name, uri: `rash://project/${id}` });
    if (result.length > 100) fail('LIMIT', 'Project listing supports at most 100 active projects');
   }
   if (!batch.truncated) return result.sort((a, b) => a.id.localeCompare(b.id));
   if (!batch.cursor || batch.cursor === cursor) fail('INVALID_STORE', 'Invalid storage cursor');
   cursor = batch.cursor;
  }
  fail('LIMIT', 'Project listing scan limit reached');
 }
 async put(record, onlyIf) {
  const text = JSON.stringify(record);
  if (new TextEncoder().encode(text).length > MAX_RECORD_BYTES) fail('LIMIT', 'Stored project exceeds limit');
  const written = await this.bucket.put(this.key(record.id), text, {
   onlyIf, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
   customMetadata: { deleted: record.deleted ? 'true' : 'false' }
  });
  // R2 signals failed conditions with null, not an exception.
  if (written === null) fail('CONFLICT', 'Project changed concurrently. Read its latest revision and retry.');
  return record;
 }
 async create(project) {
  const validated = checkedProject(project);
  if ((await this.list()).length >= 100) fail('LIMIT', 'Store supports at most 100 projects');
  return this.put({ id: crypto.randomUUID(), revision: 1, updatedAt: new Date().toISOString(), project: validated }, { etagDoesNotMatch: '*' });
 }
 async update(id, expectedRevision, project) {
  const validated = checkedProject(project);
  const { record, etag } = await this.read(id);
  this.assertRevision(record, expectedRevision);
  return this.put({ ...record, revision: record.revision + 1, updatedAt: new Date().toISOString(), project: validated }, { etagMatches: etag });
 }
 async delete(id, expectedRevision) {
  const { record, etag } = await this.read(id);
  this.assertRevision(record, expectedRevision);
  // Conditional tombstone prevents an old writer from resurrecting a deleted project.
  await this.put({ id, revision: record.revision + 1, updatedAt: new Date().toISOString(), deleted: true }, { etagMatches: etag });
  return { id, revision: record.revision, deleted: true };
 }
 assertRevision(record, expected) {
  if (!Number.isSafeInteger(expected) || expected < 1) fail('INVALID_ARGUMENT', 'Positive expectedRevision required');
  if (record.revision !== expected) fail('CONFLICT', `Revision conflict. Current revision is ${record.revision}`);
 }
}
