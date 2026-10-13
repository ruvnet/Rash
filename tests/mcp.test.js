import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { LocalStore } from '../mcp/store.js';
import { createProject } from '../web/core/model.js';
import { createMcpHandler, UI_URI } from '../mcp/protocol.js';
function client(t,directory) {
 const child=spawn(process.execPath,['mcp/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,RASH_MCP_STORE:directory},stdio:['pipe','pipe','pipe']});
 let next=0;const requests=new Map();let stderr='';child.stderr.on('data',c=>stderr+=c);
 const lines=createInterface({input:child.stdout});
 lines.on('line',line=>{const response=JSON.parse(line);requests.get(response.id)?.(response);requests.delete(response.id);});
 t.after(()=>{child.kill();lines.close();});
 const request=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++next;const timeout=setTimeout(()=>reject(new Error(`MCP timeout ${method}: ${stderr}`)),10000);
  requests.set(id,result=>{clearTimeout(timeout);resolve(result);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 });
 return {request,notify:(method,params={})=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n'),close:()=>new Promise(resolve=>{child.once('exit',resolve);child.stdin.end();}),tool:async(name,args={})=>(await request('tools/call',{name,arguments:args})).result};
}
const initialize=async c=>{const response=await c.request('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'rash-acceptance',version:'1'},capabilities:{}});assert.equal(response.result.protocolVersion,'2025-11-25');c.notify('notifications/initialized');};
function directory(t){const path=mkdtempSync(join(tmpdir(),'rash-mcp-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
test('stdio MCP lifecycle, CRUD, resource, exact revision exports and restart persistence',async t=>{
 const path=directory(t),c=client(t,path);
 assert.equal((await c.request('tools/list')).error.code,-32000);
 await initialize(c);
 const tools=(await c.request('tools/list')).result.tools;
 assert.equal(tools.length,7);assert.equal(tools.find(t=>t.name==='rash_project_delete').annotations.destructiveHint,true);
 const created=(await c.tool('rash_project_create',{template:'launch'})).structuredContent;
 assert.equal(created.revision,1);assert.equal(created.project.version,1);
 assert.equal((await c.tool('rash_project_list')).structuredContent.projects[0].id,created.id);
 const resource=await c.request('resources/read',{uri:`rash://project/${created.id}`});assert.equal(JSON.parse(resource.result.contents[0].text).id,created.id);
 created.project.name='Edited through MCP';
 const updated=(await c.tool('rash_project_update',{id:created.id,expectedRevision:1,project:created.project})).structuredContent;assert.equal(updated.revision,2);
 const stale=await c.tool('rash_project_update',{id:created.id,expectedRevision:1,project:created.project});assert.equal(stale.isError,true);assert.equal(stale.structuredContent.error.code,'CONFLICT');
 assert.equal((await c.tool('rash_render',{id:created.id,revision:1})).structuredContent.error.code,'CONFLICT');
 for(const format of ['json','svg','animated-svg','embed']) {
  const exported=(await c.tool('rash_export',{id:created.id,revision:2,format})).structuredContent;
  assert.equal(exported.revision,2);assert.ok(exported.data.length>50);
  if(format==='json')assert.equal(JSON.parse(exported.data).name,'Edited through MCP');
  if(format==='svg')assert.match(exported.data,/<svg/);
  if(format==='animated-svg')assert.match(exported.data,/<animate/);
  if(format==='embed')assert.match(exported.data,/https:\/\/ruvnet.github.io\/Rash\/embed.js/);
 }
 await c.close();const restarted=client(t,path);await initialize(restarted);
 assert.equal((await restarted.tool('rash_project_get',{id:created.id})).structuredContent.project.name,'Edited through MCP');
 assert.equal((await restarted.tool('rash_project_delete',{id:created.id,expectedRevision:1})).isError,true);
 assert.equal((await restarted.tool('rash_project_delete',{id:created.id,expectedRevision:2})).structuredContent.deleted,true);
 assert.equal((await restarted.tool('rash_project_get',{id:created.id})).structuredContent.error.code,'NOT_FOUND');
});
test('protocol rejects malformed input, unknown methods, traversal and invalid scenes',async t=>{
 const c=client(t,directory(t));await initialize(c);
 assert.equal((await c.request('unknown')).error.code,-32601);
 assert.equal((await c.request('tools/call',{name:'unknown'})).error.code,-32602);
 for(const args of [{id:'../../secret'},{id:'0'.repeat(36),path:'/tmp/test'}])assert.equal((await c.tool('rash_project_get',args)).isError,true);
 assert.equal((await c.tool('rash_project_create',{project:{version:999,nodes:[]}})).isError,true);
 assert.equal((await c.tool('rash_project_create',{template:'unknown'})).isError,true);
 assert.equal((await c.tool('rash_project_create',{project:createProject('blank'),template:'blank'})).isError,true);
 const record=(await c.tool('rash_project_create')).structuredContent;
 assert.equal((await c.tool('rash_render',{id:record.id,revision:1,frame:record.project.duration})).isError,true);
 assert.equal((await c.tool('rash_project_update',{id:record.id,expectedRevision:1,project:{version:99}})).isError,true);
 assert.equal((await c.tool('rash_project_get',{id:record.id})).structuredContent.revision,1);
});
test('local stores are isolated, symlinks refused and revision compare-and-swap protects concurrent writers',async t=>{
 const a=new LocalStore(directory(t)),b=new LocalStore(directory(t));
 const p=a.create(createProject('blank'));
 assert.throws(()=>b.get(p.id),e=>e.code==='NOT_FOUND');
 const second=new LocalStore(a.directory);second.update(p.id,1,{...p.project,name:'Other writer'});
 assert.throws(()=>a.update(p.id,1,p.project),e=>e.code==='CONFLICT');
 const malicious='11111111-1111-1111-1111-111111111111';const target=join(b.directory,'secret');writeFileSync(target,'secret');symlinkSync(target,a.path(malicious));
 assert.throws(()=>a.get(malicious),e=>e.code==='INVALID_STORE');
});
test('interactive MCP resource uses explicit host metadata and bounded store tool contract',async t=>{
 const handle=createMcpHandler({store:new LocalStore(directory(t)),readUI:()=>'<html>Rash</html>',stateless:true});
 const listed=await handle({jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.equal(listed.result.tools[0]._meta.ui.resourceUri,UI_URI);
 const resource=await handle({jsonrpc:'2.0',id:2,method:'resources/read',params:{uri:UI_URI}});
 assert.equal(resource.result.contents[0].mimeType,'text/html;profile=mcp-app');
 assert.deepEqual(resource.result.contents[0]._meta.ui.csp.connectDomains,[]);
 assert.equal((await handle([{jsonrpc:'2.0',id:3,method:'ping'}])).error.code,-32600);
});
test('stdio enforces byte limits without interpreting file paths or executing project scripts',async t=>{
 const path=directory(t);
 const child=spawn(process.execPath,['mcp/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,RASH_MCP_STORE:path},stdio:['pipe','pipe','pipe']});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.on('error',()=>{});
 const ended=new Promise(resolve=>child.once('exit',resolve));
 child.stdin.end('x'.repeat(5_100_001));
 assert.equal(await ended,1);assert.match(stderr,/exceeds/);
 const c=client(t,path);await initialize(c);
 const project=createProject('blank');project.script='throw new Error("must never execute")';
 const created=(await c.tool('rash_project_create',{project})).structuredContent;
 assert.equal(created.revision,1);
 assert.ok((await c.tool('rash_render',{id:created.id,revision:1})).structuredContent.data.startsWith('<svg'));
});
