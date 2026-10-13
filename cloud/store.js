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
 async readRaw(id) {
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
 async manifest() {
  const object = await this.bucket.get(`${this.prefix}index.json`);
  if (!object) return { ids: [], etag: null };
  if (object.size > 8192) fail('INVALID_STORE', 'Project index exceeds limit');
  let index;
  try { index = JSON.parse(await object.text()); } catch { fail('INVALID_STORE', 'Invalid project index'); }
  if (index.version !== 1 || !Array.isArray(index.ids) || index.ids.length > 100 || index.ids.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(index.ids).size !== index.ids.length) fail('INVALID_STORE', 'Invalid project index');
  return { ids: index.ids, etag: object.etag };
 }
 async read(id) {
  this.key(id);
  if (!(await this.manifest()).ids.includes(id)) fail('NOT_FOUND', 'Project not found');
  return this.readRaw(id);
 }
 async get(id) { return (await this.read(id)).record; }
 async changeIndex(addId, removeIds = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
   const index = await this.manifest();
   const ids = [];
   for (const id of index.ids) {
    if (removeIds.includes(id)) continue;
    // Recover a deletion whose index update was interrupted or contended.
    try { await this.readRaw(id); ids.push(id); }
    catch (error) { if (error.code !== 'NOT_FOUND') throw error; }
   }
   if (addId && !ids.includes(addId)) {
    if (ids.length >= 100) fail('LIMIT', 'Store supports at most 100 projects');
    ids.push(addId);
   }
   if (ids.length === index.ids.length && ids.every((id, i) => id === index.ids[i])) return;
   const written = await this.bucket.put(`${this.prefix}index.json`, JSON.stringify({ version: 1, ids }), {
    onlyIf: index.etag ? { etagMatches: index.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' }
   });
   if (written !== null) return;
  }
  fail('CONFLICT', 'Project index changed concurrently. Retry the operation.');
 }
 async list() {
  const result = [], missing = [];
  for (const id of (await this.manifest()).ids) {
   let record;
   try { record = (await this.readRaw(id)).record; }
   catch (error) { if (error.code === 'NOT_FOUND') { missing.push(id); continue; } throw error; }
   result.push({ id, revision: record.revision, updatedAt: record.updatedAt, name: record.project.name, uri: `rash://project/${id}` });
  }
  // The manifest bounds reads to 100 regardless of accumulated tombstones.
  if (missing.length) {
   try { await this.changeIndex(null, missing); }
   catch (error) { if (error.code !== 'CONFLICT') throw error; }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
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
  const record = { id: crypto.randomUUID(), revision: 1, updatedAt: new Date().toISOString(), project: validated };
  await this.put(record, { etagDoesNotMatch: '*' });
  try { await this.changeIndex(record.id); }
  catch (error) {
   // Never expose an unindexed record; erase its content if admission failed.
   await this.bucket.delete(this.key(record.id));
   throw error;
  }
  return record;
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
  try { await this.changeIndex(null, [id]); }
  catch (error) { if (error.code !== 'CONFLICT') throw error; }
  return { id, revision: record.revision, deleted: true };
 }
 assertRevision(record, expected) {
  if (!Number.isSafeInteger(expected) || expected < 1) fail('INVALID_ARGUMENT', 'Positive expectedRevision required');
  if (record.revision !== expected) fail('CONFLICT', `Revision conflict. Current revision is ${record.revision}`);
 }
}
