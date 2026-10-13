import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? pathToFileURL(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.mjs')).href : 'playwright';
let playwright;
try { playwright = await import('playwright'); } catch { playwright = await import(modulePath); }
const browserName = process.env.RASH_BROWSER || 'chromium';
assert.ok(['chromium','webkit'].includes(browserName), 'RASH_BROWSER must be chromium or webkit');
function inspectGIF(bytes) {
  const u16=i=>bytes[i]|bytes[i+1]<<8;
  const width=u16(6),height=u16(8);let at=13+((bytes[10]&128)?3*(1<<((bytes[10]&7)+1)):0),delay=0;const frames=[];
  const blocks=()=>{const chunks=[];while(bytes[at]){const count=bytes[at++];assert.ok(at+count<=bytes.length,'GIF truncated block');chunks.push(...bytes.slice(at,at+count));at+=count;}at++;return chunks;};
  while(at<bytes.length){const tag=bytes[at++];if(tag===59)break;
    if(tag===33){const label=bytes[at++];if(label===249)delay+=u16(at+2);blocks();continue;}
    assert.equal(tag,44,'GIF image descriptor');const w=u16(at+4),h=u16(at+6),packed=bytes[at+8];at+=9;if(packed&128)at+=3*(1<<((packed&7)+1));
    const minimum=bytes[at++],data=blocks(),clear=1<<minimum,end=clear+1;let bit=0,size=minimum+1,dict=[],previous=null;const pixels=[];
    const reset=()=>{dict=Array.from({length:clear},(_,i)=>[i]);dict.push(null,null);size=minimum+1;previous=null;};reset();
    while(true){assert.ok(bit+size<=data.length*8,'GIF truncated LZW');let code=0;for(let j=0;j<size;j++,bit++)code|=((data[bit>>3]>>(bit&7))&1)<<j;
      if(code===clear){reset();continue;}if(code===end)break;
      const value=dict[code]||(code===dict.length&&previous?[...previous,previous[0]]:null);assert.ok(value,'GIF invalid LZW code');pixels.push(...value);
      if(previous&&dict.length<4096){dict.push([...previous,value[0]]);if(dict.length===(1<<size)&&size<12)size++;}previous=value;
    }
    assert.equal(pixels.length,w*h);frames.push(pixels);
  }
  assert.equal(bytes[at-1],59,'GIF trailer');return {width,height,frames,delay};
}
const root = path.resolve('web');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json', '.css':'text/css' };
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/test.html') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Export test</title>'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) { response.writeHead(400).end(); return; }
  try { const data = await fs.readFile(file); response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }).end(data); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const assets = process.env.RASH_TEST_URL ? process.env.RASH_TEST_URL.replace(/\/$/,'') : base;
const host = http.createServer((request,response) => response.writeHead(200, {'Content-Type':'text/html'}).end('<!doctype html><title>Third-party embed host</title>'));
await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
const browser = await playwright[browserName].launch({ headless: true, args: browserName === 'chromium' ? ['--no-sandbox'] : [] });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/test.html`);
  const result = await page.evaluate(async origin => {
    const { createProject, addNode, evaluateCamera } = await import(`${origin}/core/model.js`);
    const { exportProject, mp4Support } = await import(`${origin}/export/export.js`);
    await import(`${origin}/embed.js`);
    const p = createProject('blank'); p.name = 'Export test'; p.width = 160; p.height = 96; p.fps = 10; p.duration = 5; p.script = '';
    p.nodes = [{ id: 'ball', type: 'ellipse', name: 'Ball', x: 0, y: 16, width: 24, height: 24, fill: '#ff6800', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, scale:1, visible: true, keyframes: [{ frame:0,x:0,easing:'linear' }, {frame:4,x:120,easing:'linear'}] }];
    const mesh=addNode(p,'mesh');Object.assign(mesh,{x:70,y:20,width:45,height:45,primitive:'box',fill:'#00ff60',rotationX:22,rotationY:30,glow:1,keyframes:[{frame:0,rotationY:30,easing:'linear'},{frame:4,rotationY:160,easing:'linear'}]});
    p.camera.keyframes=[{frame:0,yaw:-30,easing:'linear'},{frame:4,yaw:40,easing:'linear'}];
    const staticMesh=addNode(p,'mesh');Object.assign(staticMesh,{x:115,y:60,width:20,height:20,fill:'#00ff60'});
    p.nodes[0].keyframes[1].opacity=.2;p.nodes[0].keyframes[1].curves={opacity:{easing:'easeOut'}};
    const a = document.createElement('rash-player'), b = document.createElement('rash-player');
    a.setAttribute('controls',''); b.setAttribute('controls',''); document.body.append(a,b); a.project = p; b.project = p;
    a.seek(3); b.seek(1);
    const independent = a.currentFrame === 3 && b.currentFrame === 1;
    const cameraGeometry=player=>[...player.shadowRoot.querySelectorAll(`[data-node-id="${staticMesh.id}"] [data-face-id]`)].map(n=>n.getAttribute('d')).join('|');
    const animatedCameraEmbed=cameraGeometry(a)!==cameraGeometry(b);
    const node = a.shadowRoot.querySelector('[data-node-id="ball"]'); a.seek(2); const retained = node === a.shadowRoot.querySelector('[data-node-id="ball"]');
    const independentTiming=Math.abs(Number(node.getAttribute('opacity'))-.4)<1e-9;
    a.play(); const playbackDeadline=performance.now()+3000; while(a.currentFrame<=2&&performance.now()<playbackDeadline) await new Promise(r=>setTimeout(r,25)); a.pause(); const played = a.currentFrame > 2;
    const exported = {};
    for (const format of ['svg','gif','pdf','png','json','html']) {
      const {blob,filename} = await exportProject(p,format);
      exported[format] = {size:blob.size,type:blob.type,filename,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
    }
    const svgText = new TextDecoder().decode(Uint8Array.from(exported.svg.bytes));
    const svgDocument = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svgValid = !svgDocument.querySelector('parsererror');
    const projected = !!svgDocument.querySelector('[data-mesh-frame]');
    const staticMeshSampled=svgDocument.querySelectorAll(`[data-node-id="${staticMesh.id}"] [data-mesh-frame]`).length===p.duration;
    const poseProject=structuredClone(p);poseProject.camera={...evaluateCamera(p.camera,0),keyframes:[]};
    const frameZeroPoseMatches=await(await exportProject(poseProject,'png')).blob.arrayBuffer();
    const cameraRasterMatches=Uint8Array.from(exported.png.bytes).every((v,i)=>v===new Uint8Array(frameZeroPoseMatches)[i])&&frameZeroPoseMatches.byteLength===exported.png.size;
    const png = new Blob([Uint8Array.from(exported.png.bytes)],{type:'image/png'}), bitmap=await createImageBitmap(png), canvas=document.createElement('canvas');canvas.width=160;canvas.height=96;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const pixels=ctx.getImageData(0,0,160,96).data;let greenPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>pixels[i]*1.5&&pixels[i+1]>pixels[i+2]*1.5)greenPixels++;
    // Decode the actual PDF image payload; a PDF signature alone cannot prove scene content.
    const pdfBytes=Uint8Array.from(exported.pdf.bytes), pdfText=new TextDecoder('latin1').decode(pdfBytes);
    const imageHeader=/\/Subtype \/Image[\s\S]*?\/Length (\d+) >>\nstream\n/.exec(pdfText);
    if(!imageHeader) throw new Error('PDF is missing its raster image');
    const imageStart=imageHeader.index+imageHeader[0].length;
    const pdfImage=await createImageBitmap(new Blob([pdfBytes.slice(imageStart,imageStart+Number(imageHeader[1]))],{type:'image/jpeg'}));
    const pdfDimensions=[pdfImage.width,pdfImage.height];ctx.clearRect(0,0,160,96);ctx.drawImage(pdfImage,0,0);pdfImage.close();
    const pdfPixels=ctx.getImageData(0,0,160,96).data;let pdfGreenPixels=0;
    for(let i=0;i<pdfPixels.length;i+=4)if(pdfPixels[i+1]>pdfPixels[i]*1.5&&pdfPixels[i+1]>pdfPixels[i+2]*1.5)pdfGreenPixels++;
    let mp4;
    if(mp4Support()) { const videoProject=structuredClone(p);videoProject.duration=20;for(const track of [...videoProject.nodes,videoProject.camera])for(const key of track.keyframes||[])key.frame*=4;const {blob} = await exportProject(videoProject,'mp4'); mp4 = {size:blob.size,type:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
      const video=document.createElement('video'),url=URL.createObjectURL(blob);video.muted=true;video.preload='auto';
      const waitFor=event=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`MP4 ${event} timed out`)),10000);video.addEventListener(event,()=>{clearTimeout(timer);resolve();},{once:true});video.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('MP4 decode failed'));},{once:true});});
      try{const loaded=waitFor('loadeddata');video.src=url;await loaded;
        mp4.decoded={width:video.videoWidth,height:video.videoHeight,duration:video.duration};
        const sample=async time=>{const seeked=waitFor('seeked');video.currentTime=time;await seeked;ctx.drawImage(video,0,0);return Array.from(ctx.getImageData(0,0,160,96).data);};
        const first=await sample(.01),last=await sample(Math.max(.02,video.duration-.08));
        mp4.decoded.changedPixels=first.reduce((count,v,i)=>count+(Math.abs(v-last[i])>30?1:0),0);
      }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);} }
    else { try { await exportProject(p,'mp4'); } catch(e) { mp4 = {unsupported:e.message}; } }
    return { independent, retained, played, exported, svgValid, projected, greenPixels, mp4, animatedCameraEmbed, independentTiming, staticMeshSampled, cameraRasterMatches, pdfDimensions, pdfGreenPixels };
  },assets);
  assert.equal(result.independent,true); assert.equal(result.retained,true); assert.equal(result.played,true); assert.equal(result.svgValid,true);
  assert.equal(result.projected,true);assert.ok(result.greenPixels>100,'PNG rasterization must contain the green projected mesh');
  assert.equal(result.animatedCameraEmbed,true);assert.equal(result.independentTiming,true);assert.equal(result.staticMeshSampled,true);assert.equal(result.cameraRasterMatches,true);
  const exportDir = '/tmp/rash-export-validation'; await fs.mkdir(exportDir,{recursive:true});
  for(const [format,output] of Object.entries(result.exported)) { assert.ok(output.size > 20,format); await fs.writeFile(`${exportDir}/scene.${format}`, Uint8Array.from(output.bytes)); }
  assert.equal(Buffer.from(result.exported.gif.bytes.slice(0,6)).toString(),'GIF89a');
  assert.equal(Buffer.from(result.exported.pdf.bytes.slice(0,8)).toString(),'%PDF-1.4');
  assert.deepEqual(result.pdfDimensions,[160,96]);assert.ok(result.pdfGreenPixels>100,'PDF image must contain the projected mesh');
  const json=JSON.parse(Buffer.from(result.exported.json.bytes));assert.equal(json.nodes.length,3);assert.equal(json.nodes[0].keyframes[1].x,120);
  const html=Buffer.from(result.exported.html.bytes).toString();assert.match(html,/<svg/);assert.match(html,/<animate/);assert.ok(!/<script[^>]+src=/.test(html),'HTML animation must be self contained');
  const gif=inspectGIF(Uint8Array.from(result.exported.gif.bytes));assert.deepEqual([gif.width,gif.height],[160,96]);assert.equal(gif.frames.length,6);assert.equal(gif.delay,50);
  assert.notDeepEqual(gif.frames[0],gif.frames.at(-1),'GIF decoded frames must contain movement');
  assert.ok(gif.frames[0].filter(v=>((v>>2)&7)>(v>>5)*1.5&&((v>>2)&7)/7>(v&3)/3*1.5).length>100,'GIF must contain quantized green mesh pixels');
  if(result.mp4.bytes) { await fs.writeFile(`${exportDir}/scene.mp4`,Uint8Array.from(result.mp4.bytes)); assert.ok(Buffer.from(result.mp4.bytes.slice(0,32)).toString().includes('ftyp'));assert.equal(result.mp4.decoded.width,160);assert.equal(result.mp4.decoded.height,96);assert.ok(result.mp4.decoded.duration>1&&result.mp4.decoded.duration<4);assert.ok(result.mp4.decoded.changedPixels>100,'MP4 must decode moving scene content'); }
  else assert.match(result.mp4.unsupported,/MP4 recording is unavailable/);
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced = await page.evaluate(async origin => {
    const { createProject } = await import(`${origin}/core/model.js`);
    const p = createProject('blank'); p.script = '';
    const player = document.createElement('rash-player'); player.setAttribute('autoplay',''); document.body.append(player); player.project = p;
    await new Promise(r=>setTimeout(r,100)); return !player.playing;
  },assets);
  assert.equal(reduced,true);
  await page.goto(`http://127.0.0.1:${host.address().port}/`);
  const crossOrigin = await page.evaluate(async origin => {
    await import(`${origin}/embed.js`);
    const { createProject,addNode } = await import(`${origin}/core/model.js`);
    const p=createProject('blank'),mesh=addNode(p,'mesh');p.script=`getNode("${mesh.id}").rotationY = 73; getNode("${mesh.id}").glow = 4; trace("embed-ready");`;
    const player=document.createElement('rash-player');document.body.append(player);
    const result=new Promise(resolve=>{
      player.addEventListener('rash-script',e=>resolve({ok:true,logs:e.detail.logs}),{once:true});
      player.addEventListener('rash-warning',e=>resolve({ok:false,message:e.detail.message}),{once:true});
      setTimeout(()=>resolve({ok:false,message:'script event timed out'}),18000);
    });
    player.project=p;const event=await result;return {...event,node:player.project.nodes[0],faces:player.shadowRoot.querySelectorAll('[data-face-id]').length};
  },assets);
  assert.equal(crossOrigin.ok,true,JSON.stringify(crossOrigin));
  assert.equal(crossOrigin.node.rotationY,73);assert.equal(crossOrigin.node.glow,4);assert.ok(crossOrigin.faces>0);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({browser:browserName,checks:['independent players','retained SVG nodes','play/pause','reduced motion','SVG XML','GIF decoded frames and timing','PDF embedded JPEG pixels','PNG bytes','JSON','HTML','cross-origin WASM worker with 3D/effect commands','projected mesh SVG','projected mesh raster pixels','animated camera embed','independent property timing embed','camera-only SVG sampling','raster camera pose parity'],mp4:result.mp4.bytes?'verified':'unsupported with actionable error',artifacts:exportDir},null,2));
} finally { await browser.close(); await new Promise(r=>server.close(r)); await new Promise(r=>host.close(r)); }
