// Real MCP protocol and durable store; authentication gateway is tested separately.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {LocalStore} from '../mcp/store.js';
import {createMcpHandler} from '../mcp/protocol.js';
import {callTool} from '../mcp/service.js';
const directory=await mkdtemp(join(tmpdir(),'rash-studio-cloud-')),store=new LocalStore(directory),handler=createMcpHandler({store,stateless:true});
const root=resolve('web'),types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{if(req.url==='/mcp'){let body='';for await(const chunk of req)body+=chunk;res.setHeader('content-type','application/json');res.end(JSON.stringify(await handler(JSON.parse(body))));return;}const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/studio\//,'/');const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+'/'))throw Error('Invalid path');res.setHeader('content-type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`,name=process.env.RASH_BROWSER||'chromium';let browser;
try{
 const seeded=await callTool(store,'rash_project_create',{template:'dimension'});
 browser=await({chromium,webkit}[name]).launch({headless:true,args:name==='chromium'?['--no-sandbox']:[]});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/studio/');
 const manage=async()=>{await page.locator('[data-action="mcp"]').click();await page.getByRole('button',{name:'Manage cloud projects',exact:true}).click();await page.locator('#cloud-list option').nth(1).waitFor({state:'attached'});};
 await manage();await page.locator('#cloud-list').selectOption(seeded.id);await page.getByRole('button',{name:'Open selected project',exact:true}).click();await page.getByText('Confirm replacement of the current composition first.',{exact:true}).waitFor();await page.locator('#cloud-replace').check();await page.getByRole('button',{name:'Open selected project',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.locator('[data-action="rename-project"]').first().click();await page.locator('#rename-input').fill('Studio cloud roundtrip');await page.locator('[data-action="confirm-project-name"]').click();
 await manage();await page.getByRole('button',{name:'Save linked revision',exact:true}).click();await page.getByText('Saved cloud revision 2.',{exact:true}).waitFor();const saved=await callTool(store,'rash_project_get',{id:seeded.id});assert.equal(saved.project.name,'Studio cloud roundtrip');assert.deepEqual(saved.project.nodes,seeded.project.nodes);assert.deepEqual(saved.project.camera,seeded.project.camera);
 await callTool(store,'rash_project_update',{id:seeded.id,expectedRevision:2,project:{...saved.project,name:'Changed in MCP'}});await page.getByRole('button',{name:'Save linked revision',exact:true}).click();await page.locator('#cloud-status').filter({hasText:/Revision conflict/}).waitFor();assert.equal(store.get(seeded.id).project.name,'Changed in MCP');
 await page.getByRole('button',{name:'Save as new cloud project',exact:true}).click();await page.getByText('Saved cloud revision 1.',{exact:true}).waitFor();assert.equal(store.list().length,2);const copy=store.list().find(p=>p.id!==seeded.id);assert.equal(store.get(copy.id).project.name,'Studio cloud roundtrip');
 await page.locator('#cloud-list').selectOption(copy.id);await page.getByRole('button',{name:'Delete selected project…',exact:true}).click();await page.getByRole('button',{name:'Permanently delete',exact:true}).click();await page.getByText('Cloud project deleted. Device composition preserved.',{exact:true}).waitFor();assert.equal(store.list().length,1);assert.equal(await page.getByRole('button',{name:'Save linked revision',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Back to studio',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav [data-action="mobile-more"]').click();await page.getByRole('button',{name:/MCP connections/}).click();await page.getByRole('button',{name:'Manage cloud projects',exact:true}).click();await page.locator('#cloud-list option').nth(1).waitFor({state:'attached'});assert.equal(await page.locator('#modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
 await page.locator('#cloud-list').selectOption(seeded.id);await page.locator('#cloud-replace').check();await page.getByRole('button',{name:'Open selected project',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
 const download=page.waitForEvent('download');await page.keyboard.press('Control+s');const file=await(await download).path();const exported=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(exported,store.get(seeded.id).project);
 await page.goto(url+'/');await page.locator('.mobile-nav [data-action="mobile-more"]').click();await page.getByRole('button',{name:/MCP connections/}).click();await page.getByRole('button',{name:'Manage cloud projects',exact:true}).click();assert.equal(await page.getByRole('link',{name:/Open authenticated Studio/}).getAttribute('href'),'https://rash-svg-studio.ruv.chatgpt.site/studio/');assert.equal(await page.locator('#cloud-list').count(),0);assert.deepEqual(errors,[]);
 console.log(`PASS ${name}: MCP create → Studio edit → revision save → MCP read; conflicts, copy, confirmed delete, mobile, JSON integrity and public boundary`);
}finally{await browser?.close();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
