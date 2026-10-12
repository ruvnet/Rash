import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createProject,normalizeNode,validateProject} from '../web/core/model.js';
import {animatedSVG} from '../web/export/svg.js';
import {sceneToSVG} from '../web/core/renderer.js';

// Every visible element is a Rash layer. SVGs are unmodified system exports.
const output=path.resolve(process.env.RASH_EXAMPLE_DIR||'web/examples');
const entries=[];
const ink='#101923',cream='#f2f0e8',muted='#93a8b4',mint='#8df2cf',orange='#ff744a',purple='#bba5ff';
function scene(id,name,background=ink,duration=144){
 const p=createProject('blank');Object.assign(p,{id,name,width:960,height:480,background,fps:24,duration,script:'',nodes:[]});return p;
}
function layer(p,name,type,x,y,width,height,extra={}){
 const n=normalizeNode({id:`${p.id}_${String(p.nodes.length+1).padStart(2,'0')}`,name,type,x,y,width,height,fill:cream,...extra});p.nodes.push(n);return n;
}
const text=(p,name,value,x,y,size,color=cream,width=850)=>layer(p,name,'text',x,y,width,size*1.4,{text:value,fontSize:size,fontWeight:700,fill:color});
const rect=(p,name,x,y,w,h,fill,extra={})=>layer(p,name,'rect',x,y,w,h,{fill,...extra});
function keys(p,n,values){n.keyframes=values.map(([at,props])=>({frame:Math.round(at*(p.duration-1)),easing:'easeInOut',...props}));return n;}
function chrome(p,index,label,color=muted){
 text(p,'Series','R A S H   /   MOTION STUDIES',44,25,13,color);
 text(p,'Study number',`${index}   /   ${label}`,650,25,12,color,270);
 rect(p,'Footer rule',44,423,872,1,color,{opacity:.35});
 text(p,'Output label','CREATED IN RASH   ·   EXPORTED AS SVG',44,440,11,color);
 text(p,'Series marker',`${index} / 06`,854,436,15,color,70);
}
function grid(p,color='#24313d'){
 let d='';for(let x=40;x<960;x+=40)d+=`M${x} 72V406`;for(let y=86;y<407;y+=40)d+=`M40 ${y}H920`;
 layer(p,'Construction grid','path',0,0,960,480,{d,fill:'none',stroke:color,strokeWidth:.5,pathWidth:960,pathHeight:480});
}
function study01(){
 const p=scene('01-first-move','The first move',cream,120);chrome(p,'01','POSITION + EASING','#58645c');
 text(p,'Title','Small move. Big feeling.',44,88,61,ink);
 text(p,'Description','One circle. Three poses. A little personality.',48,171,19,'#606b65');
 rect(p,'Track',91,313,778,2,'#c9cec4');
 for(let i=0;i<9;i++)layer(p,`Beat ${i+1}`,'ellipse',93+i*96,309,9,9,{fill:'#b9c2b6'});
 const n=layer(p,'Moving circle','ellipse',70,278,70,70,{fill:orange});
 keys(p,n,[[0,{x:70,y:278,scale:1}],[.25,{x:427,y:224,scale:1.3}],[.5,{x:785,y:278,scale:1}],[.75,{x:427,y:224,scale:1.3}],[1,{x:70,y:278,scale:1}]]);
 text(p,'Start label','01  START',83,359,12,'#677068');text(p,'Ease label','02  EASE THROUGH',399,359,12,'#677068');text(p,'Return label','03  RETURN',780,359,12,'#677068',150);
 return {p,description:'Position and scale turn a single circle into a smooth, returning gesture.',techniques:'Position · scale · easing',posterFrame:30};
}
function study02(){
 const p=scene('02-kinetic-type','Type has rhythm');chrome(p,'02','KINETIC TYPE');
 const words=[['Give it',92,cream],['a little',186,mint],['rhythm.',280,orange]];
 for(const [i,[word,y,color]]of words.entries()){
  const n=text(p,`Type ${i+1}`,word,48,y,82,color,520);
  keys(p,n,[[0,{y:y+26,opacity:0,scale:.96}],[.12+i*.075,{y,opacity:1,scale:1,easing:'bezier',bezier:[.16,1,.3,1]}],[.70+i*.025,{y,opacity:1,scale:1}],[1,{y:y+26,opacity:0,scale:.96}]]);
 }
 for(let i=0;i<7;i++){
  const n=rect(p,`Rhythm bar ${i+1}`,608+i*40,166,22,174,i%2?mint:orange,{rx:11});
  keys(p,n,[[0,{height:50,y:260,opacity:.25}],[.20+i*.035,{height:210-i*14,y:120+i*12,opacity:1,easing:'elastic'}],[.75,{height:90+i*15,y:238-i*14,opacity:.8}],[1,{height:50,y:260,opacity:.25}]]);
 }
 return {p,description:'Staggered typography and elastic bars create a repeating editorial rhythm.',techniques:'Stagger · Bezier timing · elastic easing',posterFrame:65};
}
function study03(){
 const p=scene('03-reveal-masks','Beyond the surface','#10272c');chrome(p,'03','WIPE + IRIS','#a0c6c2');
 for(const [i,[word,y,size,w]]of [['Beyond the',123,70,610],['surface.',214,92,560]].entries()){
  const n=text(p,`Wipe title ${i+1}`,word,48,y,size,i?mint:cream,w);n.maskType='rect';
  keys(p,n,[[0,{maskWidth:0}],[.30+i*.1,{maskWidth:w,easing:'bezier',bezier:[.16,1,.3,1]}],[.78,{maskWidth:w}],[1,{maskWidth:0}]]);
 }
 const ring=layer(p,'Iris torus','mesh',669,154,242,242,{primitive:'torus',rotationX:28,rotationY:-20,fill:mint,maskType:'ellipse'});
 keys(p,ring,[[0,{maskX:121,maskY:121,maskWidth:0,maskHeight:0}],[.42,{maskX:-60,maskY:-60,maskWidth:362,maskHeight:362}],[.78,{maskX:-60,maskY:-60,maskWidth:362,maskHeight:362}],[1,{maskX:121,maskY:121,maskWidth:0,maskHeight:0}]]);
 const line=rect(p,'Underline reveal',51,337,560,5,orange,{rx:2,maskType:'rect'});keys(p,line,[[0,{maskWidth:0}],[.46,{maskWidth:560}],[.78,{maskWidth:560}],[1,{maskWidth:0}]]);
 text(p,'Description','Reveal the idea. Keep every layer editable.',51,368,17,'#a0c6c2');
 return {p,description:'Two text wipes and a 3D iris share the same portable geometric clipping system.',techniques:'Rectangular wipe · elliptical iris · static 3D geometry',posterFrame:80};
}
function study04(){
 const p=scene('04-camera-study','A new perspective','#161824',96);grid(p,'#303042');chrome(p,'04','CAMERA + ROTATION');
 text(p,'Title line 1','A new',46,120,76);text(p,'Title line 2','perspective.',46,208,66,purple,500);
 text(p,'Description','Actual geometry. Animated camera.',49,321,18,'#a6a8c0');
 const n=layer(p,'Rotating cube','mesh',660,153,180,180,{primitive:'box',fill:purple,rotationX:25,rotationY:25,glow:1});
 keys(p,n,[[0,{rotationY:25,rotationX:25}],[.5,{rotationY:205,rotationX:42,easing:'linear'}],[1,{rotationY:385,rotationX:25,easing:'linear'}]]);
 p.camera.keyframes=[{frame:0,yaw:-15,pitch:6,distance:820,fov:45,easing:'easeInOut'},{frame:48,yaw:15,pitch:-6,distance:730,fov:45,easing:'easeInOut'},{frame:95,yaw:-15,pitch:6,distance:820,fov:45,easing:'easeInOut'}];
 return {p,description:'A rotating shaded cube combines object rotation with animated camera orbit and distance.',techniques:'Three.js box · rotation · camera orbit · depth',posterFrame:29};
}
function study05(){
 const p=scene('05-3d-constellation','Form in orbit','#102221',120);grid(p,'#233d37');chrome(p,'05','3D COMPOSITION','#8ab4a4');
 text(p,'Title','Form in orbit.',46,90,58);text(p,'Description','One scene. Four geometric voices.',49,161,17,'#9fbfb4');
 layer(p,'Orbital structure','mesh',360,115,322,322,{primitive:'torus',wireframe:true,fill:'#76c6a9',rotationX:64,rotationY:28,opacity:.6});
 const a=layer(p,'Mint cube','mesh',655,110,140,140,{primitive:'box',fill:mint,rotationX:25,rotationY:20,z:35});
 const b=layer(p,'Coral pyramid','mesh',257,258,120,120,{primitive:'pyramid',fill:orange,rotationX:12,rotationY:0});
 const c=layer(p,'Violet satellite','mesh',772,286,100,100,{primitive:'box',fill:purple,rotationX:30,rotationY:20,z:-45});
 for(const [i,n]of[a,b,c].entries())keys(p,n,[[0,{rotationY:n.rotationY,y:n.y}],[.5,{rotationY:n.rotationY+180,y:n.y-(i+1)*9,easing:'linear'}],[1,{rotationY:n.rotationY+360,y:n.y,easing:'linear'}]]);
 return {p,description:'Three rotating satellites move around a retained wireframe torus, with layered depth and restrained color.',techniques:'Box + pyramid + torus · wireframe · depth · coordinated rotation',posterFrame:36};
}
function study06(){
 const p=scene('06-studio-sequence','Make the next move','#111520',144);chrome(p,'06','MOTION DESIGN');
 // A layered title sequence uses real editor tracks, masks, effects and curves.
 for(let i=0;i<8;i++){
  const n=rect(p,`Signal ${i+1}`,622+i*36,115,9,250,i%2?purple:mint,{rotation:24,opacity:.16,rx:4});
  keys(p,n,[[0,{y:160,opacity:.05}],[.3+i*.025,{y:100+i*7,opacity:.32}],[.8,{y:106+i*7,opacity:.24}],[1,{y:160,opacity:.05}]]);
 }
 const box=layer(p,'Hero geometry','mesh',699,182,152,152,{primitive:'box',fill:orange,rotationX:28,rotationY:35,glow:2});
 keys(p,box,[[0,{rotationY:35,scale:.78,y:201}],[.4,{rotationY:179,scale:1,y:182,easing:'bezier',bezier:[.22,1,.36,1],curves:{rotationY:{easing:'linear'},scale:{easing:'elastic'}}}],[.8,{rotationY:323,scale:1,y:182,easing:'linear'}],[1,{rotationY:395,scale:.78,y:201,easing:'linear'}]]);
 const title=text(p,'Title wipe','Make the',47,119,76,cream,590);title.maskType='rect';
 keys(p,title,[[0,{maskWidth:0,opacity:0,blur:7}],[.28,{maskWidth:590,opacity:1,blur:0,curves:{maskWidth:{easing:'bezier',bezier:[.16,1,.3,1]},opacity:{easing:'linear'}}}],[.82,{maskWidth:590,opacity:1,blur:0}],[1,{maskWidth:0,opacity:0,blur:7}]]);
 const line=text(p,'Title rise','next move.',45,214,86,mint,590);
 keys(p,line,[[0,{y:245,opacity:0,scale:.98}],[.40,{y:214,opacity:1,scale:1,easing:'bezier',bezier:[.16,1,.3,1]}],[.82,{y:214,opacity:1,scale:1}],[1,{y:245,opacity:0,scale:.98}]]);
 const rule=rect(p,'Accent wipe',51,329,477,5,orange,{maskType:'rect',rx:2});keys(p,rule,[[0,{maskWidth:0}],[.5,{maskWidth:477}],[.82,{maskWidth:477}],[1,{maskWidth:0}]]);
 const caption=text(p,'Campaign caption','MOTION WITH INTENT. MADE FOR THE WEB.',51,370,13,'#acb6c9');keys(p,caption,[[0,{opacity:0}],[.48,{opacity:1}],[.82,{opacity:1}],[1,{opacity:0}]]);
 return {p,description:'A complete art directed title loop combines a text wipe, focus reveal, staggered bars, independent curves and glowing 3D geometry.',techniques:'Art direction · masks · blur + glow · independent curves · layered 3D',posterFrame:80};
}

await fs.mkdir(output,{recursive:true});
for(const make of[study01,study02,study03,study04,study05,study06]){
 const {p:source,...meta}=make(),p=validateProject(source),svg=animatedSVG(p),json=JSON.stringify(p,null,2)+'\n',poster=sceneToSVG(p,meta.posterFrame);
 const stem=p.id;await fs.writeFile(path.join(output,stem+'.svg'),svg+'\n');await fs.writeFile(path.join(output,stem+'.rash.json'),json);await fs.writeFile(path.join(output,stem+'.poster.svg'),poster+'\n');
 entries.push({id:stem,name:p.name,...meta,width:p.width,height:p.height,fps:p.fps,durationFrames:p.duration,seconds:p.duration/p.fps,layers:p.nodes.length,svgBytes:Buffer.byteLength(svg+'\n'),gzipBytes:gzipSync(svg+'\n').length,projectBytes:Buffer.byteLength(json),sha256:createHash('sha256').update(svg+'\n').digest('hex')});
}
const sourceFiles=['scripts/generate-examples.mjs','web/core/model.js','web/core/renderer.js','web/core/three-svg.js','web/export/svg.js','web/vendor/three-vector.js'];
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({generator:'node scripts/generate-examples.mjs',sourceHashes,examples:entries},null,2)+'\n');
console.table(entries.map(({id,svgBytes,gzipBytes,layers,seconds})=>({id,svgBytes,gzipBytes,layers,seconds})));
