import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {meshPaths} from '../web/core/three-svg.js';

// A bespoke, script free editorial explainer, using Rash's production 3D
// projection. It is not an unmodified editor export or a new runtime feature.
const output=path.resolve(process.env.RASH_HEADER_DIR||'web/header');
const C={paper:'#f0f3ee',mint:'#9bf3d0',orange:'#ff7954',violet:'#b6a1ff',muted:'#91a2b3'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const attrs=o=>Object.entries(o).map(([k,v])=>` ${k}="${esc(v)}"`).join('');
const text=(x,y,value,size=16,fill=C.paper,extra={})=>`<text${attrs({x,y,fill,'font-size':size,...extra})}>${esc(value)}</text>`;
const rect=(x,y,width,height,fill,extra={})=>`<rect${attrs({x,y,width,height,fill,...extra})}/>`;
const pathSVG=(d,stroke,width=1,extra={})=>`<path${attrs({d,fill:'none',stroke,'stroke-width':width,...extra})}/>`;
const circle=(cx,cy,r,fill,extra={})=>`<circle${attrs({cx,cy,r,fill,...extra})}/>`;
const group=(body,extra={})=>`<g${attrs(extra)}>${body}</g>`;
const curve='M0 80C82 80 76 0 164 0';
const chapters=[
 {word:'DESIGN',title:['Start with','a spark.'],copy:'Vectors. Type. Layers. Your canvas.',detail:'Templates · web + social sizes · touch editing',color:C.orange},
 {word:'CHOREOGRAPH',title:['Give it','character.'],copy:'Every keyframe. Every curve. Your timing.',detail:'Masks · stagger · blur · glow · blending',color:C.mint},
 {word:'DIRECT IN 3D',title:['Break out','of the flat.'],copy:'Three.js geometry. A moving camera.',detail:'Box · sphere · torus · pyramid · depth',color:C.violet},
 {word:'PUBLISH',title:['Your idea.','Everywhere.'],copy:'One composition. Many ways to share.',detail:'SVG · GIF · PNG · HTML · PDF raster stills · MP4¹',color:C.mint}
];

function geometry(animated){
 // The box really rotates in three dimensions; interpolate projected vertices
 // instead of repeating full groups. Visibility follows production backface
 // culling. Twelve triangles do not need a shared cross object depth buffer.
 const frames=120,period=12;
 const samples=Array.from({length:frames+1},(_,i)=>{
  const t=i/frames*Math.PI*2;
  return meshPaths({primitive:'box',width:185,height:185,fill:C.orange,rotationX:26+Math.sin(t)*13,rotationY:34+i/frames*360,z:0},{yaw:Math.sin(t)*12,pitch:8,distance:800,fov:45});
 });
 const ids=[...new Set(samples.flatMap(f=>f.map(p=>p.id)))];
 return ids.map(id=>{
  const first=samples.flat().find(f=>f.id===id);
  let last=first;
  const series=samples.map(s=>{const p=s.find(p=>p.id===id);last=p||last;return {...last,visible:!!p};});
  const initial=series[0],anim=(name,values,mode='linear')=>animated?`<animate attributeName="${name}" values="${values.join(';')}" dur="${period}s" repeatCount="indefinite" calcMode="${mode}"/>`:'';
  return `<path${attrs({d:initial.d,fill:initial.fill,stroke:initial.fill,'stroke-width':.6,'stroke-linejoin':'round',opacity:initial.visible?1:0})}>${anim('d',series.map(p=>p.d))}${anim('fill',series.map(p=>p.fill))}${anim('stroke',series.map(p=>p.fill))}${anim('opacity',series.map(p=>p.visible?1:0),'discrete')}</path>`;
 }).join('');
}

function ring(){
 const faces=meshPaths({primitive:'torus',width:380,height:380,fill:C.mint,rotationX:48,rotationY:-24,wireframe:true,strokeWidth:.65},{});
 return faces.map(p=>`<path${attrs({d:p.d,fill:'none',stroke:p.stroke,'stroke-width':p.strokeWidth,opacity:.5})}/>`).join('');
}

function panel(index){
 let content='';
 if(index===0){
  content=pathSVG('M28 80C76 80 86 26 130 26S200 80 258 38',C.orange,3)+
   pathSVG('M28 80L76 80M86 26L170 26M200 80L258 38','#506072',1)+
   [[28,80],[130,26],[258,38]].map(([x,y])=>rect(x-4,y-4,8,8,C.orange)).join('')+
   [[76,80],[86,26],[170,26],[200,80]].map(([x,y])=>circle(x,y,3,'#0c1521',{stroke:C.muted})).join('')+
   group(pathSVG('M0 0L0 23L6 17L12 28L17 25L11 14L21 13Z',C.paper,1.6,{fill:'#111d29'}),{class:'pen',transform:'translate(240 44)'})+
   text(297,43,'EVERY POINT',12,C.muted,{'letter-spacing':1.4})+text(297,70,'A possibility.',23,C.paper,{'font-weight':600});
 }else if(index===1){
  content=[30,57,84].map((y,i)=>text(18,y+4,['POSITION','MASK','GLOW'][i],10,C.muted,{'letter-spacing':1})).join('');
  content+=[0,1,2].map(i=>rect(116+i*27,23+i*27,300-i*44,14,[C.mint,C.violet,C.orange][i],{rx:4,opacity:.22})+[132+i*27,274,400-i*20].map(x=>rect(x,26+i*27,8,8,[C.mint,C.violet,C.orange][i],{transform:`rotate(45 ${x+4} ${30+i*27})`})).join('')).join('');
  content+=group(pathSVG('M0 12V98',C.paper,1.4)+pathSVG('M-5 8H5V14L0 19L-5 14Z',C.paper,1,{fill:C.paper}),{class:'playhead'});
 }else if(index===2){
  content=group(pathSVG(curve,C.violet,3)+pathSVG('M0 80L48 80M116 0H164','#6c6089',1)+circle(48,80,3,C.violet)+circle(116,0,3,C.violet),{transform:'translate(28 20)'})+
   text(234,39,'SCENE CAMERA',12,C.muted,{'letter-spacing':1.3})+text(234,69,'Orbit. Focus. Reveal.',24,C.paper,{'font-weight':600})+text(234,93,'Perspective + independent property curves',11,C.muted);
 }else{
  content=text(22,37,'<rash-player',20,C.mint,{'font-family':'monospace'})+text(22,65,'  src="your-idea.rash.json"',15,C.paper,{'font-family':'monospace'})+text(22,89,'  controls autoplay loop />',15,C.muted,{'font-family':'monospace'})+
   rect(338,24,134,62,'#172a2b',{rx:8,stroke:'#2a5249'})+text(405,51,'EMBED',14,C.mint,{'text-anchor':'middle','font-weight':700,'letter-spacing':2})+text(405,72,'YOUR WEBSITE',10,C.muted,{'text-anchor':'middle','letter-spacing':1});
 }
 return group(rect(0,0,500,112,'#0d1622',{rx:12,stroke:'#263443'})+content,{transform:'translate(48 452)'});
}

function makeSVG(animated){
 const motion=animated;
 const css=`
 text{font-family:Arial,Helvetica,sans-serif} .chapter{opacity:0;animation:chapter 20s linear infinite}.chapter0{opacity:1}.chapter1{animation-delay:5s}.chapter2{animation-delay:10s}.chapter3{animation-delay:15s}
 @keyframes chapter{0%,22%{opacity:1;transform:translateY(0)}24.9%,100%{opacity:0;transform:translateY(-8px)}}
 .orbit{transform-origin:851px 335px;animation:orbit 24s linear infinite}@keyframes orbit{to{transform:rotate(360deg)}}
 .orbit-reverse{animation-direction:reverse;animation-duration:32s}
 .float{animation:float 6s ease-in-out infinite}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-13px)}}
 .signal{stroke-dasharray:4 16;animation:signal 4s linear infinite}@keyframes signal{to{stroke-dashoffset:-120}}
 .playhead{animation:playhead 5s cubic-bezier(.25,.1,.25,1) infinite}@keyframes playhead{from{transform:translateX(123px)}to{transform:translateX(450px)}}
 .pen{animation:pen 5s ease-in-out infinite}@keyframes pen{0%,100%{transform:translate(240px,44px)}50%{transform:translate(122px,31px)}}
 .sweep{transform-origin:0 0;animation:sweep 20s linear infinite}@keyframes sweep{from{transform:scaleX(0)}to{transform:scaleX(1)}}
 .pulse{animation:pulse 4s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:.35}50%{opacity:.85}}
 .draw{stroke-dasharray:620;animation:draw 8s cubic-bezier(.22,1,.36,1) infinite}@keyframes draw{0%,100%{stroke-dashoffset:620}45%,75%{stroke-dashoffset:0}}
 .static-geometry{display:none}
 @media(prefers-reduced-motion:reduce){:root:not([data-motion="on"]) *{animation:none!important}:root:not([data-motion="on"]) .chapter{opacity:0!important}:root:not([data-motion="on"]) .chapter0{opacity:1!important;transform:none!important}:root:not([data-motion="on"]) .animated-geometry{display:none}:root:not([data-motion="on"]) .static-geometry{display:inline}:root:not([data-motion="on"]) .sweep{transform:scaleX(1)}:root:not([data-motion="on"]) .playhead{transform:translateX(274px)}}
 ${motion?'':'*{animation:none!important}.chapter{opacity:0!important}.chapter0{opacity:1!important}.static-geometry{display:inline}.animated-geometry{display:none}.sweep{transform:scaleX(1)}'}
 `;
 const defs=`<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#07121a"/><stop offset=".55" stop-color="#10151e"/><stop offset="1" stop-color="#141323"/></linearGradient><radialGradient id="halo"><stop stop-color="#77dcb3" stop-opacity=".16"/><stop offset="1" stop-color="#77dcb3" stop-opacity="0"/></radialGradient><linearGradient id="edge"><stop stop-color="${C.mint}"/><stop offset=".5" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.orange}"/></linearGradient><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#66829b" opacity=".23"/></pattern><filter id="glow" x="-.4" y="-.4" width="1.8" height="1.8" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2.5"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="bounds"><rect width="1200" height="720" rx="22"/></clipPath><clipPath id="reveal"><rect x="579" y="140" width="561" height="460"/></clipPath></defs>`;
 let content=rect(0,0,1200,720,'url(#bg)',{rx:22})+rect(0,0,1200,720,'url(#grid)',{rx:22})+circle(870,331,290,'url(#halo)');
 content+=pathSVG('M48 105H1152','#29323d')+rect(48,104,74,2,C.orange);
 content+=text(48,77,'rash',63,C.paper,{'font-weight':900,'letter-spacing':-5})+circle(187,72,6,C.orange)+text(218,69,'THE OPEN MOTION STUDIO',13,C.muted,{'letter-spacing':2.7});
 content+=circle(934,58,4,C.mint,{class:'pulse'})+text(950,63,'RUST / WASM / SVG',13,C.mint,{'letter-spacing':1.6});
 content+=text(47,190,'Ideas in motion.',69,C.paper,{'font-weight':800,'letter-spacing':-3.5})+text(49,225,'From the first point to the final frame.',20,C.muted);
 // Geometric stage: projected torus, a genuinely rotating box, orbit tracks,
 // restrained glow and a camera frustum. The SVG fetches nothing at playback.
 let hero=pathSVG('M610 497L854 194L1129 486M656 459H1092M699 405H1043M741 353H995M788 297H942','#30403f',.8,{opacity:.5});
 hero+=group(`<ellipse cx="851" cy="335" rx="265" ry="93" fill="none" stroke="#456159" stroke-width="1"/><ellipse cx="851" cy="335" rx="265" ry="93" fill="none" stroke="${C.mint}" stroke-width="1.5" class="signal"/>${circle(1116,335,5,C.mint)}`,{class:'orbit'});
 hero+=group(`<ellipse cx="851" cy="335" rx="228" ry="153" fill="none" stroke="#51456a" stroke-width="1" stroke-dasharray="2 9"/>${circle(623,335,4,C.violet)}`,{class:'orbit orbit-reverse'});
 hero+=group(ring(),{transform:'translate(661 145)'});
 hero+=group(group(group(geometry(motion),{class:'animated-geometry'})+group(geometry(false),{class:'static-geometry'}),{transform:'translate(758.5 242.5)',filter:'url(#glow)'}),{class:'float'});
 hero+=pathSVG('M660 231V208H683M1018 208H1041V231M660 441V464H683M1018 464H1041V441',C.muted,1,{opacity:.55});
 hero+=text(677,196,'SCENE / 001',10,C.muted,{'letter-spacing':2})+text(953,484,'LIVE GEOMETRY',10,C.muted,{'letter-spacing':1.5});
 hero+=group(rect(0,0,166,57,'#101b27',{rx:9,stroke:'#334a55'})+circle(19,20,3,C.mint)+text(30,25,'RETAINED SVG',11,C.mint,{'letter-spacing':1})+text(15,44,'Crisp at every scale.',12,C.muted),{transform:'translate(967 152)'});
 hero+=group(rect(0,0,172,54,'#171924',{rx:9,stroke:'#423b58'})+text(14,23,'3D → VECTOR',12,C.violet,{'letter-spacing':1.4})+text(14,42,'Three.js, reprojected.',12,C.muted),{transform:'translate(613 507)'});
 content+=group(hero,{'clip-path':'url(#reveal)'});
 for(const [i,c]of chapters.entries()){
  let body=text(50,275,`${String(i+1).padStart(2,'0')} / ${c.word}`,12,c.color,{'letter-spacing':2.5,'font-weight':700});
  body+=text(47,335,c.title[0],54,C.paper,{'letter-spacing':-2,'font-weight':800})+text(47,392,c.title[1],54,c.color,{'letter-spacing':-2,'font-weight':800});
  body+=text(50,428,c.copy,17,C.muted)+panel(i);
  body+=text(50,591,c.detail,13,C.muted);
  const specials=[['TOUCH + DESKTOP','Autosave · history · templates'],['TIME, SHAPED','Curves · reveals · effects'],['PLAY + PROGRAM','Rust workers · collector game demo'],['OPEN BY DESIGN','Local projects · portable embeds']][i];
  body+=text(836,537,specials[0],12,c.color,{'letter-spacing':1.2})+text(836,558,specials[1],12,C.muted);
  if(i===3)body+=text(836,586,'¹ MP4 in supporting browsers',11,C.muted);
  content+=group(body,{class:`chapter chapter${i}`,'data-chapter':i});
 }
 content+=pathSVG('M48 621H1152','#2b3541')+group(rect(0,0,1104,2,'url(#edge)',{class:'sweep'}),{transform:'translate(48 620)'});
 const labels=[['01','DESIGN'],['02','CHOREOGRAPH'],['03','DIRECT IN 3D'],['04','PUBLISH']];
 for(const [i,[n,label]]of labels.entries()){
  const x=48+i*280;
  content+=text(x,652,n,11,C.muted)+text(x+29,653,label,15,C.paper,{'letter-spacing':1.4,'font-weight':700});
  content+=group(rect(x+28,665,118,2,chapters[i].color),{class:`chapter chapter${i}`});
 }
 content+=text(48,698,'RuVector search · rash:// resources · Claude skills · MetaHarness · optional Ruffle SWFs',12,C.muted);
 content+=text(1152,698,'OPEN SOURCE / v0.4',11,C.muted,{'text-anchor':'end','letter-spacing':1.2});
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-labelledby="title desc"><title id="title">Rash: ideas in motion</title><desc id="desc">A twenty second capability explainer: design vectors and type, choreograph keyframes and masks, direct Three.js geometry with animated cameras, then publish SVG, GIF, PNG, HTML, PDF stills or browser supported MP4 and JavaScript embeds. Rust and WebAssembly workers, RuVector search, local resources, Claude skills and optional Ruffle SWF playback. Reduced motion shows the first chapter. This editorial header uses Rash geometry; it is not an editor project.</desc><style>${css}</style>${defs}<g clip-path="url(#bounds)">${content}</g></svg>\n`;
}

await fs.mkdir(output,{recursive:true});
const svg=makeSVG(true),poster=makeSVG(false);
await fs.writeFile(path.join(output,'rash-header.svg'),svg);
await fs.writeFile(path.join(output,'rash-header.poster.svg'),poster);
const sourceFiles=['scripts/generate-header.mjs','web/core/three-svg.js','web/vendor/three-vector.js'];
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,createHash('sha256').update(await fs.readFile(f)).digest('hex')])));
const manifest={generator:'node scripts/generate-header.mjs',width:1200,height:720,seconds:20,chapters:chapters.map(c=>c.word),svgBytes:Buffer.byteLength(svg),gzipBytes:gzipSync(svg).length,sha256:createHash('sha256').update(svg).digest('hex'),posterBytes:Buffer.byteLength(poster),sourceHashes};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
