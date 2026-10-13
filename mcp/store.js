import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, rmdirSync, writeFileSync, lstatSync, openSync, readSync, closeSync, fsyncSync, constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkedProject, MAX_PROJECT_BYTES, RashError } from './service.js';
const MAX_RECORD_BYTES=MAX_PROJECT_BYTES+4096;
export class LocalStore {
 constructor(directory) {
  this.directory=resolve(directory);
  mkdirSync(this.directory,{recursive:true,mode:0o700});
  if(lstatSync(this.directory).isSymbolicLink())throw new Error('Store directory cannot be a symbolic link');
 }
 path(id) {
  if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw new RashError('INVALID_ARGUMENT','Invalid project id');
  return join(this.directory,`${id}.json`);
 }
 locked(fn) {
  const lock=join(this.directory,'.write-lock');
  try {mkdirSync(lock,{mode:0o700});}catch {throw new RashError('BUSY','Project store is busy. Retry; if a writer crashed, remove .write-lock after stopping all servers.');}
  try {return fn();}finally {rmdirSync(lock);}
 }
 get(id) {
  let fd;
  try {
   fd=openSync(this.path(id),constants.O_RDONLY|constants.O_NOFOLLOW);
   const buffer=Buffer.alloc(MAX_RECORD_BYTES+1),bytes=readSync(fd,buffer,0,buffer.length,0);
   if(bytes>MAX_RECORD_BYTES)throw new RashError('LIMIT','Stored project exceeds limit');
   const record=JSON.parse(buffer.subarray(0,bytes).toString('utf8'));
   if(record.id!==id||!Number.isSafeInteger(record.revision)||record.revision<1)throw new Error('Invalid record');
   record.project=checkedProject(record.project);
   return record;
  }catch(error) {
   if(error.code==='ENOENT')throw new RashError('NOT_FOUND','Project not found');
   if(error instanceof RashError)throw error;
   throw new RashError('INVALID_STORE','Project record cannot be read');
  }finally {if(fd!==undefined)closeSync(fd);}
 }
 list() {
  return readdirSync(this.directory).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).sort().map(n=>{
   const {id,revision,updatedAt,project}=this.get(n.slice(0,-5));return {id,revision,updatedAt,name:project.name,uri:`rash://project/${id}`};
  });
 }
 save(record) {
  const text=JSON.stringify(record);
  if(Buffer.byteLength(text)>MAX_RECORD_BYTES)throw new RashError('LIMIT','Stored project exceeds limit');
  const records=this.list();
  if(!records.some(r=>r.id===record.id)&&records.length>=100)throw new RashError('LIMIT','Store supports at most 100 projects');
  let bytes=Buffer.byteLength(text);
  for(const entry of records)if(entry.id!==record.id)bytes+=lstatSync(this.path(entry.id)).size;
  if(bytes>100_000_000)throw new RashError('LIMIT','Store exceeds 100 MB');
  const temporary=join(this.directory,`.${randomUUID()}.tmp`);
  try {
   const fd=openSync(temporary,'wx',0o600);
   try {writeFileSync(fd,text);fsyncSync(fd);}finally {closeSync(fd);}
   renameSync(temporary,this.path(record.id));
   this.syncDirectory();
  }
  finally {try {unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return record;
 }
 syncDirectory() {const fd=openSync(this.directory,constants.O_RDONLY);try {fsyncSync(fd);}finally {closeSync(fd);}}
 create(project) {return this.locked(()=>this.save({id:randomUUID(),revision:1,updatedAt:new Date().toISOString(),project:checkedProject(project)}));}
 update(id,expectedRevision,project) {return this.locked(()=>{const record=this.get(id);this.assertRevision(record,expectedRevision);return this.save({...record,revision:record.revision+1,updatedAt:new Date().toISOString(),project:checkedProject(project)});});}
 delete(id,expectedRevision) {return this.locked(()=>{const record=this.get(id);this.assertRevision(record,expectedRevision);unlinkSync(this.path(id));this.syncDirectory();return {id,revision:record.revision,deleted:true};});}
 assertRevision(record,expected) {if(record.revision!==expected)throw new RashError('CONFLICT',`Revision conflict. Current revision is ${record.revision}`);}
}
