import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

// Editorial illustrations of implemented workflows. These are not editor exports.
// Keep motion in CSS so the same geometry also produces a true static poster.
const output=path.resolve(process.env.RASH_README_ART_DIR||'docs/animations');
const C={paper:'#f0f3ee',mint:'#9bf3d0',orange:'#ff7954',violet:'#b6a1ff',muted:'#91a2b3',line:'#293847',panel:'#0d1622'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const attrs=o=>Object.entries(o).map(([k,v])=>` ${k}="${esc(v)}"`).join('');
const text=(x,y,value,size=14,fill=C.paper,extra={})=>`<text${attrs({x,y,fill,'font-size':size,...extra})}>${esc(value)}</text>`;
const rect=(x,y,width,height,fill,extra={})=>`<rect${attrs({x,y,width,height,fill,...extra})}/>`;
const line=(d,stroke=C.line,width=1,extra={})=>`<path${attrs({d,fill:'none',stroke,'stroke-width':width,...extra})}/>`;
const circle=(cx,cy,r,fill,extra={})=>`<circle${attrs({cx,cy,r,fill,...extra})}/>`;
const group=(body,extra={})=>`<g${attrs(extra)}>${body}</g>`;
const mono={'font-family':'monospace'};
const pill=(x,y,w,label,color)=>rect(x,y,w,24,color,{rx:12,'fill-opacity':.1,stroke:color,'stroke-opacity':.3})+text(x+w/2,y+16,label,10,color,{'text-anchor':'middle','letter-spacing':1});
const diamond=(x,y,color,size=7)=>rect(x-size/2,y-size/2,size,size,color,{transform:`rotate(45 ${x} ${y})`});
const dotGrid=()=>rect(400,54,520,282,'url(#dots)',{rx:14});

function authoring(){
 let body=rect(400,54,520,282,C.panel,{rx:14,stroke:C.line})+dotGrid();
 body+=rect(400,54,520,30,'#172230',{rx:14})+rect(400,69,520,15,'#172230');
 body+=[C.orange,C.violet,C.mint].map((c,i)=>circle(417+i*13,69,3,c)).join('')+text(468,73,'scene / first move',11,C.muted,mono)+text(900,73,'24 FPS',10,C.mint,{'text-anchor':'end'});
 body+=line('M522 84V336M400 254H920');
 body+=text(414,106,'LAYERS',9,C.muted,{'letter-spacing':1.3});
 body+=[['Hero',C.orange],['Orbit',C.mint],['Backdrop',C.violet]].map(([s,c],i)=>rect(409,115+i*32,103,25,i===0?'#32302e':'#131e2b',{rx:5})+diamond(421,127+i*32,c,5)+text(433,131+i*32,s,11,i===0?C.paper:C.muted)).join('');
 body+=line('M552 215C592 215 604 119 660 119S745 226 791 200S839 130 883 130',C.orange,1.4,{'stroke-dasharray':'3 5','stroke-opacity':.55});
 body+=group(circle(0,0,25,C.orange)+rect(-34,-34,68,68,'none',{stroke:C.mint,'stroke-width':1})+[-34,34].flatMap(x=>[-34,34].map(y=>rect(x-3,y-3,6,6,C.panel,{stroke:C.mint}))).join(''),{class:'hero'});
 body+=text(416,275,'TIMELINE',9,C.muted,{'letter-spacing':1.1});
 body+=[0,1].map(i=>rect(550+i*28,274+i*27,320-i*54,12,[C.orange,C.violet][i],{rx:3,'fill-opacity':.18})+[550+i*28,700,869-i*26].map(x=>diamond(x,280+i*27,[C.orange,C.violet][i],5)).join('')).join('');
 body+=group(line('M0 260V325',C.paper,1)+line('M-4 260H4V265L0 269L-4 265Z',C.paper,1,{fill:C.paper}),{class:'playhead'});
 return {body,css:`.hero{transform:translate(660px,119px);animation:hero 7s cubic-bezier(.45,0,.55,1) infinite}@keyframes hero{0%,100%{transform:translate(570px,207px) scale(.75) rotate(-12deg)}50%{transform:translate(837px,148px) scale(1.1) rotate(12deg)}}.playhead{transform:translateX(700px);animation:playhead 7s cubic-bezier(.45,0,.55,1) infinite}@keyframes playhead{0%,100%{transform:translateX(550px)}50%{transform:translateX(869px)}}`};
}

function exports(){
 const formats=[['SVG','VECTOR MOTION',C.orange],['GIF','FRAME ANIMATION',C.mint],['HTML','ANIMATED PAGE',C.violet],['MP4¹','BROWSER VIDEO',C.mint],['PNG','STILL IMAGE',C.violet],['PDF','RASTER STILL',C.orange]];
 let body=dotGrid()+line('M438 198H486M486 110V287M486 110H508M486 198H508M486 287H508',C.muted,1.2)+circle(438,198,16,C.panel,{stroke:C.mint})+diamond(438,198,C.mint,13);
 body+=group(circle(0,0,3,C.mint),{class:'packet'});
 for(const [i,[format,label,color]]of formats.entries()){
  const x=508+i%2*204,y=64+Math.floor(i/2)*88;
  let card=rect(0,0,194,78,C.panel,{rx:10,stroke:C.line})+text(17,28,format,20,color,{'font-weight':700})+text(17,59,label,9,C.muted,{'letter-spacing':.7});
  if(i<4)card+=group(circle(157,31,13,'none',{stroke:color,'stroke-opacity':.2,'stroke-width':3})+circle(157,31,13,'none',{stroke:color,'stroke-width':3,'stroke-dasharray':'24 58',class:'format-spin',style:`animation-delay:-${i*1.2}s`}),{'aria-hidden':'true'});
  else card+=rect(147,16,22,29,'none',{rx:3,stroke:color})+line('M151 36L157 29L164 36',color,1.5)+circle(161,24,2,color);
  body+=group(card,{transform:`translate(${x} ${y})`,'data-card':'194 78'});
 }
 body+=pill(508,336,185,'JSON / EDITABLE SOURCE',C.mint)+text(713,352,'¹ Supported browsers',11,C.muted);
 return {body,css:`.format-spin{transform-box:fill-box;transform-origin:center;animation:spin 4s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.packet{transform:translate(456px,198px);animation:packet 3s ease-in-out infinite}@keyframes packet{0%,100%{transform:translate(438px,198px);opacity:0}30%{opacity:1}80%{transform:translate(504px,198px);opacity:1}}`};
}

function miniScene(x,y,w,h,delay,id){
 // Each illustration has an independent clock, as do real rash-player instances.
 // Local clipping keeps transformed geometry inside either device screen.
 const unit=Math.min(w,h),clip=`screen-${id}`;
 const scene=rect(0,0,w,h,'#152732',{rx:5})+line(`M10 ${h*.66}H${w-10}`,'#2a4650')+
  group(circle(0,0,unit*.16,C.orange)+circle(0,0,unit*.27,'none',{stroke:C.mint,'stroke-width':1,'stroke-opacity':.6})+circle(unit*.27,0,3,C.mint),{transform:`translate(${w/2} ${h/2})`})+
  group(circle(w/2,h/2,unit*.16,C.orange)+line(`M${w/2-unit*.3} ${h/2}H${w/2+unit*.3}`,C.violet,1.2),{class:'scene-drift',style:`animation-delay:${delay}s;transform-origin:${w/2}px ${h/2}px`});
 return group(`<defs><clipPath id="${clip}">${rect(0,0,w,h,'white',{rx:5})}</clipPath></defs>`+group(scene,{'clip-path':`url(#${clip})`}),{transform:`translate(${x} ${y})`});
}
function embeds(){
 let body=dotGrid()+rect(406,83,337,223,C.panel,{rx:12,stroke:C.line})+line('M406 112H743');
 body+=[C.orange,C.violet,C.mint].map((c,i)=>circle(421+i*12,98,2.5,c)).join('')+text(482,102,'your-site.example',10,C.muted,mono);
 body+=miniScene(419,124,311,141,-1,'desktop')+line('M425 285L431 281L425 277Z',C.mint,1,{fill:C.mint})+rect(442,280,274,3,'#293f49',{rx:1.5})+rect(442,280,181,3,C.mint,{rx:1.5,class:'progress-one'})+text(416,329,'<rash-player> … </rash-player>',12,C.mint,mono);
 body+=rect(772,57,135,265,'#080e16',{rx:22,stroke:'#405565','stroke-width':2})+rect(818,65,43,5,'#293847',{rx:2.5})+miniScene(782,83,115,196,-3.6,'phone')+line('M789 298L794 294L789 290Z',C.violet,1,{fill:C.violet})+rect(803,293,80,3,'#293f49',{rx:1.5})+rect(803,293,51,3,C.violet,{rx:1.5,class:'progress-two'});
 body+=pill(771,338,137,'INDEPENDENT CLOCKS',C.violet);
 return {body,css:`.scene-drift{animation:drift 6s ease-in-out infinite}@keyframes drift{0%,100%{transform:translateX(-20px) rotate(-20deg)}50%{transform:translateX(20px) rotate(20deg)}}.progress-one,.progress-two{transform-box:fill-box;transform-origin:left center;animation:progress 6s ease-in-out infinite}.progress-two{animation-delay:-2.6s}@keyframes progress{0%,100%{transform:scaleX(.15)}50%{transform:scaleX(1.4)}}`};
}

function runtime(){
 let body=rect(400,54,520,107,C.panel,{rx:12,stroke:C.line})+text(420,77,'ACTIONS',10,C.muted,{'letter-spacing':1.3})+pill(795,64,107,'SOURCE SUBSET',C.orange);
 body+=text(420,110,'getNode("hero").x = 120;',18,C.mint,mono)+text(420,138,'trace("move");',18,C.violet,mono);
 body+=line('M477 161V192H485M635 243H711',C.muted,1.5,{'stroke-dasharray':'3 5'})+group(circle(0,0,4,C.mint),{class:'command'});
 body+=rect(403,208,232,113,'#13252a',{rx:12,stroke:'#34504e'})+text(422,233,'DEDICATED WORKER',10,C.mint,{'letter-spacing':1.5})+text(422,262,'Rust + WASM',24,C.paper,{'font-weight':700})+text(422,292,'Bounded script execution',12,C.muted)+pill(505,171,147,'VALIDATE COMMANDS',C.mint);
 body+=rect(711,192,209,129,C.panel,{rx:12,stroke:C.line})+text(727,215,'SVG STAGE',10,C.muted,{'letter-spacing':1.3})+line('M731 282H900',C.line)+group(rect(-13,-13,26,26,C.orange,{rx:5})+rect(-20,-20,40,40,'none',{stroke:C.mint}),{class:'script-node'});
 body+=text(403,350,'No DOM · No network · Commands commit on success',12,C.muted);
 return {body,css:`.command{transform:translate(660px,243px);animation:command 5s linear infinite}@keyframes command{0%,10%{transform:translate(477px,162px);opacity:0}15%{opacity:1}35%{transform:translate(477px,192px)}50%{transform:translate(519px,192px);opacity:0}55%{transform:translate(635px,243px);opacity:0}65%{opacity:1}85%,100%{transform:translate(709px,243px);opacity:0}}.script-node{transform:translate(844px,266px);animation:node 5s cubic-bezier(.22,1,.36,1) infinite}@keyframes node{0%,65%,100%{transform:translate(764px,266px)}82%,94%{transform:translate(868px,266px)}}`};
}

const panels=[
 {id:'authoring',eyebrow:'01 / AUTHOR',title:['A stage for','your ideas.'],copy:['Draw a vector. Set a keyframe.','Give every layer a little life.'],footer:'DRAW · KEYFRAME · PREVIEW',color:C.orange,make:authoring,description:'A selected vector moves across a stage as the timeline playhead travels between keyframes.'},
 {id:'exports',eyebrow:'02 / EXPORT',title:['Made to','move you.'],copy:['Motion for the web.','Stills for the moments that matter.'],footer:'SEVEN OUTPUT FORMATS',color:C.mint,make:exports,description:'A composition flows to SVG, GIF, HTML and browser supported MP4 animation, PNG and raster PDF stills, and editable project JSON.'},
 {id:'embeds',eyebrow:'03 / EMBED',title:['One scene.','Every screen.'],copy:['A player that fits your page.','Each instance keeps its own time.'],footer:'RESPONSIVE · CONTROLS · REDUCED MOTION',color:C.violet,make:embeds,description:'Desktop and phone players show the same composition with independent playback clocks and responsive frames.'},
 {id:'runtime',eyebrow:'04 / SCRIPT',title:['Code the','interaction.'],copy:['A bounded ActionScript inspired subset.','Rust and WebAssembly under the hood.'],footer:'SOURCE → WORKER → SVG',color:C.mint,make:runtime,description:'ActionScript inspired source passes through a dedicated Rust and WASM worker; validated scene commands move an SVG node.'}
];
function render(panel,animated){
 const {body,css}=panel.make();
 const style=`text{font-family:Arial,Helvetica,sans-serif}${css}@media(prefers-reduced-motion:reduce){*{animation:none!important}}${animated?'':'*{animation:none!important}'}`;
 const defs='<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#09131c"/><stop offset="1" stop-color="#121323"/></linearGradient><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#557184" opacity=".25"/></pattern></defs>';
 const heading=text(36,68,panel.eyebrow,12,panel.color,{'letter-spacing':2,'font-weight':700})+panel.title.map((s,i)=>text(33,148+i*54,s,49,C.paper,{'font-weight':800,'letter-spacing':-2})).join('')+panel.copy.map((s,i)=>text(36,242+i*23,s,15,C.muted)).join('')+rect(36,296,36,3,panel.color,{rx:1.5})+text(36,326,panel.footer,10,panel.color,{'letter-spacing':.8});
 return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="400" viewBox="0 0 960 400" role="img" aria-labelledby="title desc"><title id="title">Rash / ${esc(panel.eyebrow.slice(5))}</title><desc id="desc">${esc(panel.description)} Editorial workflow illustration.</desc><style>${style}</style>${defs}${rect(0,0,960,400,'url(#bg)',{rx:18})}${rect(.5,.5,959,399,'none',{rx:18,stroke:C.line})}${heading}${body}${line('M36 370H924',C.line)}${text(36,388,'RASH / OPEN MOTION STUDIO',9,C.muted,{'letter-spacing':1.5})}${text(923,388,'SVG · NO SCRIPTS · NO EXTERNAL ASSETS',9,C.muted,{'text-anchor':'end','letter-spacing':.8})}</svg>\n`;
}
const hash=s=>createHash('sha256').update(s).digest('hex');
await fs.mkdir(output,{recursive:true});
const manifest={kind:'editorial-workflow-illustrations',width:960,height:400,source:'scripts/generate-readme-art.mjs',sourceSha256:hash(await fs.readFile(new URL(import.meta.url))),panels:[]};
for(const panel of panels){
 const files={};
 for(const animated of [true,false]){
  const filename=`${panel.id}${animated?'':'.poster'}.svg`,svg=render(panel,animated);
  await fs.writeFile(path.join(output,filename),svg);
  files[animated?'animation':'poster']={file:filename,bytes:Buffer.byteLength(svg),gzipBytes:gzipSync(svg).length,sha256:hash(svg)};
 }
 manifest.panels.push({id:panel.id,description:panel.description,...files});
}
manifest.totalAnimatedBytes=manifest.panels.reduce((n,p)=>n+p.animation.bytes,0);
manifest.totalAnimatedGzipBytes=manifest.panels.reduce((n,p)=>n+p.animation.gzipBytes,0);
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Generated ${panels.length} animations and posters: ${manifest.totalAnimatedBytes} SVG bytes / ${manifest.totalAnimatedGzipBytes} summed gzip bytes.`);
