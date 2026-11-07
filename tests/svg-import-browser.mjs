import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve('web');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 try{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(file===root)file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>window.RashStudio);
 const before=await page.evaluate(()=>{const p=RashStudio.getProject();return {name:p.name,width:p.width,height:p.height,background:p.background,nodeIds:p.nodes.map(node=>node.id)};});
 await page.locator('[data-action="file-menu"]').click();
 await page.locator('#menu [data-action="import-svg"]').click();
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 50"><g id="logo-group" fill="#123456"><path id="mark" d="M10 20h30v20z"/><path id="detail" style="fill:#ff0000" d="M50 20h20v20z"/></g></svg>';
 await page.locator('#svg-import').setInputFiles({name:'two-shapes.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
 await page.waitForFunction(()=>window.RashStudio.getProject().symbols?.some(symbol=>symbol.name==='logo-group'));
 const imported=await page.evaluate(()=>RashStudio.getProject());
 assert.equal(imported.name,before.name);
 assert.equal(imported.width,before.width);
 assert.equal(imported.height,before.height);
 assert.equal(imported.background,before.background);
 assert.deepEqual(imported.nodes.slice(0,before.nodeIds.length).map(node=>node.id),before.nodeIds);
 assert.equal(imported.nodes.length,before.nodeIds.length+1);
 const group=imported.nodes.at(-1),definition=imported.symbols.find(symbol=>symbol.id===group.symbolId);
 assert.equal(group.name,'logo-group');
 assert.equal(group.type,'symbol');
 assert.equal(group.width,60);
 assert.equal(group.height,20);
 assert.equal(definition.nodes.length,2);
 assert.deepEqual(definition.nodes.map(node=>node.name),['mark','detail']);
 assert.deepEqual(definition.nodes.map(node=>node.fill),['#123456','#ff0000']);
 assert.deepEqual(definition.nodes.map(node=>[node.x,node.y,node.width,node.height]),[[0,0,30,20],[40,0,20,20]]);
 assert.deepEqual(definition.nodes.map(node=>[node.pathOffsetX,node.pathOffsetY]),[[10,20],[50,20]]);
 assert.equal(group.x,(before.width-100)/2);
 assert.equal(group.y,(before.height-50)/2);
 assert.equal(await page.locator(`#stage [data-node-id="${group.id}"]:not([data-symbol-node-id])`).count(),1);

 await page.locator('#svg-import').setInputFiles({name:'unsupported.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script></svg>')});
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Could not import SVG'));
 assert.equal((await page.evaluate(()=>RashStudio.getProject().nodes.length)),before.nodeIds.length+1);
 assert.equal(await page.locator('#stage script').count(),0);
 assert.deepEqual(errors,[]);
 await page.locator('[data-action="commands"]').click();
 await page.locator('#command-input').fill('Undo');
 await page.locator('#command-list button').click();
 assert.equal((await page.evaluate(()=>RashStudio.getProject().nodes.length)),before.nodeIds.length);
 await page.locator('[data-action="commands"]').click();
 await page.locator('#command-input').fill('Redo');
 await page.locator('#command-list button').click();
 assert.equal((await page.evaluate(()=>RashStudio.getProject().nodes.length)),before.nodeIds.length+1);

 await page.locator('#svg-import').setInputFiles(path.resolve('logo.svg'));
 await page.waitForFunction(()=>window.RashStudio.getProject().symbols?.some(symbol=>symbol.name==='gLyra'));
 const logo=await page.evaluate(()=>RashStudio.getProject());
 const importedGroups=logo.nodes.slice(before.nodeIds.length+1);
 assert.deepEqual(importedGroups.map(node=>node.name),['Ebene 1']);
 assert.equal(logo.symbols.length,5);
 const rootGroup=logo.symbols.find(symbol=>symbol.name==='Ebene 1');
 assert.deepEqual(rootGroup.nodes.map(node=>node.name),['gLyra','gWappen']);
 assert.ok(logo.symbols.find(symbol=>symbol.name==='gLyra').nodes.some(node=>node.name==='lyra'));
 assert.equal(logo.symbols.find(symbol=>symbol.name==='gWappen').nodes.length,4);
 assert.equal(logo.symbols.find(symbol=>symbol.name==='gAdler').nodes.length,4);
 await page.locator('[data-panel="library"]').click();
 await page.getByRole('button',{name:'Edit symbol: Ebene 1'}).click();
 await page.waitForFunction(()=>window.RashStudio.getEditingScope()!==null);
 const rootGroupId=await page.evaluate(()=>RashStudio.getEditingScope());
 const editableGroup=await page.evaluate(id=>RashStudio.getProject().symbols.find(symbol=>symbol.id===id),rootGroupId);
 assert.deepEqual(editableGroup.nodes.map(node=>node.name),['gLyra','gWappen']);
 await page.locator('#scope-breadcrumb [data-action="scene-scope"]').click();

 const beforeFlat=await page.evaluate(()=>{const p=RashStudio.getProject();return {nodes:p.nodes.length,symbols:p.symbols.length};});
 await page.locator('[data-action="file-menu"]').click();
 await page.locator('#menu [data-action="import-svg-paths"]').click();
 await page.locator('#svg-import').setInputFiles(path.resolve('logo.svg'));
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Imported 8 SVG paths'));
 const flat=await page.evaluate(()=>RashStudio.getProject());
 const paths=flat.nodes.slice(beforeFlat.nodes);
 assert.equal(paths.length,8);
 assert.ok(paths.every(node=>node.type==='path'));
 assert.equal(flat.symbols.length,beforeFlat.symbols);
 assert.ok(paths[0].width<flat.width&&paths[0].height<flat.height);
 const selectedPath=paths[0];
 await page.getByLabel('Blur',{exact:true}).fill('8');
 await page.getByLabel('Blur',{exact:true}).press('Tab');
 assert.equal((await page.evaluate(id=>RashStudio.getProject().nodes.find(node=>node.id===id).blur,selectedPath.id)),8);
 console.log('PASS flat import creates individually selectable path layers with editable effects');
 console.log('PASS SVG import merges into the current project with tight path bounds and editable nested groups');
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
