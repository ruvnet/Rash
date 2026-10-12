import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('web');
const types={'.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{if(req.url==='/test'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Embed game acceptance</title>');return;}const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep))throw Error();res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:700,height:1000},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/test`);
 const source=await page.evaluate(async()=>{await import('/embed.js');const {createProject}=await import('/core/model.js');const project=createProject('game');project.script='';for(const id of ['one','two']){const el=document.createElement('rash-player');el.id=id;el.setAttribute('controls','');el.style.width='640px';document.body.append(el);el.project=project;}return project;});
 const playerId=source.nodes.find(n=>n.name==='player').id;
 const player=page.locator('#one'),other=page.locator('#two');
 const transform=el=>el.locator(`g[data-node-id="${playerId}"]`).getAttribute('transform');
 const initial=await transform(player),independent=await transform(other);
 await player.locator('svg').focus();await page.keyboard.down('ArrowRight');await page.waitForTimeout(220);await page.keyboard.up('ArrowRight');await player.getByRole('button',{name:'Pause animation'}).click();
 assert.notEqual(await transform(player),initial,'Keyboard input moves the rendered game player');assert.equal(await transform(other),independent,'Other embeds remain independent');
 assert.deepEqual(await player.evaluate(el=>el.project),source,'Game playback never mutates the published source project');
 await player.getByRole('button',{name:'Restart game'}).click();await player.getByRole('button',{name:'Pause animation'}).click();assert.equal(await transform(player),initial,'Restart restores initial geometry');
 const box=await player.locator('svg').boundingBox();await page.touchscreen.tap(box.x+220,box.y+240);await page.waitForTimeout(250);await player.getByRole('button',{name:'Pause animation'}).click();
 assert.notEqual(await transform(player),initial,'Touch input moves the rendered game player');
 const stopped=await transform(player);await page.waitForTimeout(100);assert.equal(await transform(player),stopped,'Pause stops game simulation');
 assert.deepEqual(await player.evaluate(el=>el.project),source);assert.deepEqual(errors,[]);
 console.log('PASS embedded game keyboard movement, touch movement, pause, restart, independent players, immutable source and no browser errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
