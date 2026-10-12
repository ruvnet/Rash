export const MAX_NODES = 1000;
export const presets = [
  {id:'web', name:'Web · 16:9',width:1280,height:720},
  {id:'square',name:'Social square · 1:1',width:1080,height:1080},
  {id:'story',name:'Story / Reel · 9:16',width:1080,height:1920},
  {id:'banner',name:'Display banner',width:1200,height:400},
  {id:'hd',name:'Full HD',width:1920,height:1080},
  {id:'a4',name:'A4 landscape',width:1123,height:794},
  {id:'classic',name:'Classic Flash',width:550,height:400}
];
export const templates = [
 {id:'orbit',name:'Orbital / Product story',description:'Cinematic vector rings, kinetic typography and an orbital motion study.',tags:['technology','product','motion']},
 {id:'launch',name:'Make some noise',description:'Bold launch title, geometric shapes and bright expressive motion.',tags:['social','launch','brand']},
 {id:'social',name:'Social signal',description:'A portrait story for your next big idea. Ready for reels and stories.',tags:['social','story','portrait']},
 {id:'kinetic',name:'Type in motion',description:'Editorial typography with staggered timing and smooth movement.',tags:['text','type','editorial']},
 {id:'game',name:'Orbit collector',description:'Interactive keyboard and touch game. Collect energy, avoid the red debris.',tags:['game','interactive','physics']},
 {id:'blank',name:'Blank canvas',description:'A fresh stage. Your imagination takes it from here.',tags:['empty','design']}
];
let sequence=0;
export const uid=()=>`n${Date.now().toString(36)}${(++sequence).toString(36)}`;
const finite=(v,fallback=0,min=-100000,max=100000)=>typeof v==='number' && Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
const str=(v,fallback='',max=1000)=>typeof v==='string'?v.slice(0,max):fallback;
export const safeColor=(v,fallback='#ffffff')=>typeof v==='string' && /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|none|transparent|black|white|red|green|blue|yellow|cyan|magenta|orange|purple|gray|grey)$/i.test(v)?v:fallback;
const easings=new Set(['linear','easeIn','easeOut','easeInOut','step']);
export function normalizeNode(n,i=0){
 if(!n || typeof n!=='object')throw new Error('Invalid scene node');
 const type=['rect','ellipse','text','path'].includes(n.type)?n.type:'rect';
 const node={id:str(n.id,`node${i}`,100).replace(/[^\w-]/g,'')||`node${i}`,name:str(n.name,'Layer',100),type,
 x:finite(n.x),y:finite(n.y),width:finite(n.width,160,1,10000),height:finite(n.height,100,1,10000),
 fill:safeColor(n.fill),stroke:safeColor(n.stroke,'none'),strokeWidth:finite(n.strokeWidth,0,0,100),
 rotation:finite(n.rotation),opacity:finite(n.opacity,1,0,1),scale:finite(n.scale,1,0.001,100),
 text:str(n.text,'Text',5000),fontSize:finite(n.fontSize,48,1,1000),fontWeight:finite(n.fontWeight,600,100,900),
 visible:n.visible!==false,locked:n.locked===true,rx:finite(n.rx,0,0,1000),
 d:str(n.d,'',50000).replace(/[^MmLlHhVvCcSsQqTtAaZz0-9., eE+\-]/g,''),keyframes:[]};
 if(Array.isArray(n.keyframes))node.keyframes=n.keyframes.slice(0,1000).map(k=>{
  const f={frame:Math.round(finite(k.frame,0,0,36000)),easing:easings.has(k.easing)?k.easing:'easeInOut'};
  for(const p of ['x','y','width','height','rotation','opacity','scale'])if(k[p]!==undefined)f[p]=finite(k[p],node[p],p==='opacity'?0:p==='scale'?0.001:(p==='width'||p==='height')?1:-100000,p==='opacity'?1:p==='scale'?100:(p==='width'||p==='height')?10000:100000);
  return f;
 }).sort((a,b)=>a.frame-b.frame).filter((k,i,a)=>!i||a[i-1].frame!==k.frame);
 return node;
}
export function validateProject(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Expected a Rash project');
 if(p.version!==1)throw new Error('Unsupported Rash project version');
 if(!Array.isArray(p.nodes)||p.nodes.length>MAX_NODES)throw new Error(`A scene supports at most ${MAX_NODES} layers`);
 if(p.nodes.reduce((sum,n)=>sum+(Array.isArray(n?.keyframes)?n.keyframes.length:0),0)>10000)throw new Error('A scene supports at most 10,000 keyframes');
 const out={version:1,id:str(p.id,uid(),100),name:str(p.name,'Untitled project',120),width:Math.round(finite(p.width,1280,16,4096)),height:Math.round(finite(p.height,720,16,4096)),fps:Math.round(finite(p.fps,30,1,120)),duration:Math.round(finite(p.duration,240,1,36000)),background:safeColor(p.background,'#111522'),nodes:p.nodes.map(normalizeNode),script:str(p.script,'',50000)};
 if(new Set(out.nodes.map(n=>n.id)).size!==out.nodes.length)throw new Error('Layer IDs must be unique');
 return out;
}
export const cloneProject=p=>structuredClone(p);
export const serializeProject=p=>JSON.stringify(validateProject(p),null,2);
export function parseProject(text){if(typeof text!=='string'||text.length>5_000_000)throw new Error('Project exceeds the 5 MB import limit');return validateProject(JSON.parse(text));}
export function ease(t,kind='easeInOut'){
 t=Math.max(0,Math.min(1,t));
 return kind==='linear'?t:kind==='easeIn'?t*t:kind==='easeOut'?1-(1-t)*(1-t):kind==='step'?0:t*t*(3-2*t);
}
export function evaluateNode(node,frame){
 const n={...node}; const keys=node.keyframes||[];
 for(const prop of ['x','y','width','height','rotation','opacity','scale']){
  const relevant=keys.filter(k=>Number.isFinite(k[prop]));if(!relevant.length)continue;
  let previous={frame:0,[prop]:node[prop]};
  for(const next of relevant){
   if(frame<next.frame){const t=ease((frame-previous.frame)/(next.frame-previous.frame),next.easing);n[prop]=previous[prop]+(next[prop]-previous[prop])*t;break;}
   previous=next;n[prop]=next[prop];
  }
 }
 return n;
}
export const evaluateScene=(p,frame)=>p.nodes.map(n=>evaluateNode(n,Math.max(0,Math.min(p.duration-1,Number(frame)||0))));
export function addNode(p,type='rect'){
 if(p.nodes.length>=MAX_NODES)throw new Error('Layer limit reached');
 const n=normalizeNode({id:uid(),name:`${type==='text'?'Text':type==='ellipse'?'Ellipse':type==='path'?'Path':'Rectangle'} ${p.nodes.length+1}`,type,x:p.width/2-100,y:p.height/2-60,width:200,height:120,fill:type==='text'?'#f7f6f2':'#ff6b35',rx:12,text:'Your next idea',fontSize:52});
 p.nodes.push(n);return n;
}
export function addKeyframe(p,id,frame){
 const n=p.nodes.find(n=>n.id===id);if(!n)return;
 const f=Math.round(Math.max(0,Math.min(p.duration-1,frame)));const current=evaluateNode(n,f);
 let k=n.keyframes.find(k=>k.frame===f);if(!k){k={frame:f,easing:'easeInOut'};n.keyframes.push(k);n.keyframes.sort((a,b)=>a.frame-b.frame);}
 for(const prop of ['x','y','width','height','rotation','opacity','scale'])k[prop]=current[prop];return k;
}
export function createProject(template='orbit',preset='web'){
 const size=presets.find(p=>p.id===preset)||presets[0];
 const p={version:1,...size,id:uid(),name:templates.find(t=>t.id===template)?.name.split(' / ')[0]||'Untitled',fps:30,duration:240,background:'#111522',nodes:[],script:'// RashScript: a bounded ActionScript-inspired runtime\ntrace("Hello, Rash.");\n'};
 const W=p.width,H=p.height,s=Math.min(W/1280,H/720);
 const node=(name,type,x,y,w,h,extra={})=>{const n=normalizeNode({id:uid(),name,type,x:x*W/1280,y:y*H/720,width:w*W/1280,height:h*H/720,...extra});p.nodes.push(n);return n;};
 const text=(name,txt,x,y,size,color='#f3f1ec')=>node(name,'text',x,y,1000,100,{text:txt,fontSize:size*s,fill:color,fontWeight:700});
 if(template==='blank'){p.name='Untitled project';p.background='#f8f7f4';return p;}
 if(template==='orbit'){
  text('Eyebrow','R A S H  /  MOTION STUDY 001',76,62,15,'#939ba9');
  for(let i=0;i<6;i++)node(`Orbital ring ${i+1}`,'ellipse',666+i*25,92+i*24,480-i*50,480-i*48,{fill:'none',stroke:i===0?'#535966':'#39404f',strokeWidth:1.2,rotation:-28+i*8});
  node('Horizontal meridian','ellipse',657,268,495,100,{fill:'none',stroke:'#5b6372',strokeWidth:1,rotation:-28});
  node('Vertical meridian','ellipse',859,89,100,489,{fill:'none',stroke:'#5b6372',strokeWidth:1,rotation:-28});
  const orb=node('Orbit / orange','ellipse',774,86,126,126,{fill:'#ff6b35'});orb.keyframes=[{frame:0,x:orb.x,y:orb.y},{frame:120,x:orb.x+170*s,y:orb.y+320*s,easing:'easeInOut'},{frame:239,x:orb.x,y:orb.y,easing:'easeInOut'}];
  node('Moon','ellipse',1070,419,44,44,{fill:'#e7e4db'});
  text('Headline / 01','Ideas in',76,180,94);text('Headline / 02','motion.',76,282,112);
  text('Description','From a spark to something extraordinary.',82,438,22,'#9ba3b0');
  node('Play badge','rect',82,518,203,48,{fill:'#ff6b35',rx:24});text('CTA','MAKE YOUR MOVE  ↗',106,535,13,'#161924');
  node('Footer rule','rect',76,629,1128,1,{fill:'#363d4b'});text('Edition','BUILT FOR THE OPEN WEB',76,651,12,'#9199a5');text('Format','SVG  /  30 FPS  /  ∞ POSSIBILITIES',868,651,11,'#9199a5');
 } else if(template==='launch'||template==='kinetic'){
  p.background=template==='launch'?'#d7f255':'#ece8dd';
  for(let i=0;i<6;i++){const n=node(`Motion bar ${i+1}`,'rect',760+i*55,80,28,560,{fill:template==='launch'?'#202620':'#ff6b35',rotation:28,rx:14});n.keyframes=[{frame:0,y:n.y+80,opacity:0},{frame:35+i*10,y:n.y,opacity:1},{frame:239,rotation:38}];}
  text('Label','R A S H  /  CREATIVE FREQUENCY',74,68,16,'#263022');text('Headline 1',template==='launch'?'Make some':'Type. Move.',70,206,108,'#202620');text('Headline 2',template==='launch'?'noise.':'Repeat.',70,330,112,'#202620');text('Footer','GOOD IDEAS DON’T STAND STILL.',80,598,20,'#263022');
 } else if(template==='social'){
  p.background='#7258ef';node('Card','rect',80,75,1120,570,{fill:'#eee9e2',rx:36});text('Issue','RASH CREATIVE CLUB / 001',135,115,21,'#7258ef');text('Headline 1','Your next',132,246,100,'#272238');text('Headline 2','big idea.',132,359,100,'#272238');const n=node('Spark','ellipse',900,455,150,150,{fill:'#ff7644'});n.keyframes=[{frame:0,scale:0.5},{frame:80,scale:1.2},{frame:160,scale:0.5},{frame:239,scale:1.2}];text('Footer','START SOMETHING. SHARE EVERYWHERE.',132,559,16,'#7258ef');
 } else if(template==='game'){
  p.background='#0e1822';text('Game title','ORBIT COLLECTOR',65,50,32,'#eaf4ef');text('Game instructions','ARROW KEYS OR TOUCH · COLLECT THE GREEN SIGNALS',65,105,15,'#94aca9');
  for(let i=0;i<8;i++)node(`energy-${i}`,'ellipse',155+i*132,210+(i%3)*108,24,24,{fill:'#b4ef6b'});
  node('hazard-0','ellipse',550,290,44,44,{fill:'#f07766'});node('hazard-1','ellipse',925,480,44,44,{fill:'#f07766'});
  node('player','rect',110,510,42,42,{fill:'#79d8ed',rx:10});text('Game status','PRESS PLAY TO EXPLORE',65,636,18,'#a4b6b9');
 }
 if(template==='orbit'){const index=p.nodes.findIndex(n=>n.name==='Orbit / orange');p.nodes.push(p.nodes.splice(index,1)[0]);}
 return validateProject(p);
}
