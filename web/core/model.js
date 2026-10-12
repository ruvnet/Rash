export const MAX_NODES = 1000;
export const MAX_TEXT_LINES_PER_NODE=256,MAX_TEXT_LINES=10000;
export const MAX_MESHES=32,MAX_MESH_TRIANGLES=4096;
export const MAX_EFFECT_LAYERS=64,MAX_EFFECT_AREA=16_000_000,MAX_SCENE_EFFECT_AREA=32_000_000;
export const MESH_TRIANGLES=Object.freeze({box:12,sphere:168,torus:192,pyramid:6});
export const MASK_TYPES=Object.freeze(['none','rect','ellipse']);
export const MASK_PROPERTIES=Object.freeze(['maskX','maskY','maskWidth','maskHeight','maskRotation']);
export const ANIMATED_PROPERTIES=Object.freeze(['x','y','width','height','rotation','opacity','scale','rotationX','rotationY','z','blur','glow',...MASK_PROPERTIES]);
export const CAMERA_PROPERTIES=Object.freeze(['yaw','pitch','distance','fov']);
export const MAX_CAMERA_KEYFRAMES=1000,MAX_TIMING_OVERRIDES=20000;
export const EASINGS=Object.freeze(['linear','easeIn','easeOut','easeInOut','step','bezier','bounce','elastic']);
export const DEFAULT_CAMERA=Object.freeze({yaw:0,pitch:0,distance:800,fov:45});
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
 {id:'dimension',name:'Beyond / 3D motion',description:'Rotating Three.js geometry, depth, soft glow and expressive motion typography.',tags:['3d','motion','cinematic']},
 {id:'mask',name:'Mask reveal',description:'Editable vector wipes and iris reveals for text, shapes and 3D layers.',tags:['mask','reveal','motion']},
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
const easings=new Set(EASINGS);
const propertyBounds={opacity:[0,1],scale:[0.001,100],width:[1,10000],height:[1,10000],z:[-300,300],blur:[0,30],glow:[0,30],maskWidth:[0,10000],maskHeight:[0,10000]};
const cameraBounds={yaw:[-180,180],pitch:[-180,180],distance:[500,2000],fov:[20,90]};
const boundedProperty=(value,property,fallback=0)=>finite(value,fallback,...(propertyBounds[property]||[-100000,100000]));
const boundedCameraProperty=(value,property,fallback=DEFAULT_CAMERA[property])=>finite(value,fallback,...cameraBounds[property]);
export function normalizeBezier(value){return Array.isArray(value)&&value.length===4?value.map((v,i)=>finite(v,i===0?.25:i===1?.1:i===2?.25:1,i%2?-2:0,i%2?3:1)):[.25,.1,.25,1];}
function normalizeTiming(value){const timing={easing:easings.has(value?.easing)?value.easing:'easeInOut'};if(timing.easing==='bezier')timing.bezier=normalizeBezier(value?.bezier);return timing;}
function timingSource(key,property){return property!=='all'&&key?.curves&&typeof key.curves==='object'&&!Array.isArray(key.curves)&&Object.hasOwn(key.curves,property)?key.curves[property]||key:key;}
export function keyframeTiming(key,property='all'){
 if(property!=='all'&&!ANIMATED_PROPERTIES.includes(property))throw new Error('Unknown animated property');
 return normalizeTiming(timingSource(key,property));
}
export function setKeyframeTiming(key,property,timing){
 if(!key||typeof key!=='object'||Array.isArray(key))throw new Error('Invalid keyframe');
 if(property!=='all'&&!ANIMATED_PROPERTIES.includes(property))throw new Error('Unknown animated property');
 const normalized=normalizeTiming(timing);
 if(property==='all'){
  key.easing=normalized.easing;if(normalized.bezier)key.bezier=normalized.bezier;else delete key.bezier;
  delete key.curves;
 }else{
  if(!Number.isFinite(key[property]))throw new Error(`Author a ${property} keyframe before editing its timing`);
  const curves={};
  for(const prop of ANIMATED_PROPERTIES)if(key.curves&&Object.hasOwn(key.curves,prop))curves[prop]=normalizeTiming(key.curves[prop]);
  curves[property]=normalized;key.curves=curves;
 }
 return key;
}
export function normalizeCamera(camera={}){
 const out=Object.fromEntries(CAMERA_PROPERTIES.map(property=>[property,boundedCameraProperty(camera?.[property],property)]));
 out.keyframes=[];
 if(Array.isArray(camera?.keyframes)){
  if(camera.keyframes.length>MAX_CAMERA_KEYFRAMES)throw new Error('A camera supports at most 1,000 keyframes');
  out.keyframes=camera.keyframes.map(key=>{
   if(!key||typeof key!=='object'||Array.isArray(key))throw new Error('Invalid camera keyframe');
   const normalized={frame:Math.round(finite(key.frame,0,0,36000)),...normalizeTiming(key)};
   for(const property of CAMERA_PROPERTIES)if(key[property]!==undefined)normalized[property]=boundedCameraProperty(key[property],property,out[property]);
   return normalized;
  }).sort((a,b)=>a.frame-b.frame).filter((key,index,keys)=>!index||keys[index-1].frame!==key.frame);
 }
 return out;
}
export const hasNodeEffects=n=>n.blur>0||n.glow>0||(n.keyframes||[]).some(k=>k.blur>0||k.glow>0);
// Bound every possible interpolated value, including expressive easing overshoot.
function trackRange(node,property){
 let low=node[property],high=low,previous=low;
 const cameraProperty=CAMERA_PROPERTIES.includes(property),bound=cameraProperty?boundedCameraProperty:boundedProperty;
 for(const key of node.keyframes||[]){
  if(key[property]===undefined)continue;
  const timing=timingSource(key,cameraProperty?'all':property),next=bound(key[property],property,node[property]);
  let min=0,max=1;
  if(timing?.easing==='bezier'){const curve=normalizeBezier(timing.bezier);min=Math.min(0,curve[1],curve[3]);max=Math.max(1,curve[1],curve[3]);}
  else if(timing?.easing==='elastic')max=1.4;
  const lower=bound(previous+(next-previous)*min,property,node[property]),upper=bound(previous+(next-previous)*max,property,node[property]);
  low=Math.min(low,next,lower,upper);high=Math.max(high,next,lower,upper);previous=next;
 }
 return [low,high];
}
// Read current camera values without cloning each key for every filtered layer.
// This is deliberately uncached: edits to an existing camera object take effect.
function cameraForBounds(input){
 const camera=Object.fromEntries(CAMERA_PROPERTIES.map(property=>[property,boundedCameraProperty(input?.[property],property)]));
 const keys=Array.isArray(input?.keyframes)?input.keyframes:[];
 if(keys.length>MAX_CAMERA_KEYFRAMES)throw new Error('A camera supports at most 1,000 keyframes');
 const frame=key=>Math.round(finite(key.frame,0,0,36000));
 let ordered=true,previous=-1;
 for(const key of keys){
  if(!key||typeof key!=='object'||Array.isArray(key))throw new Error('Invalid camera keyframe');
  const current=frame(key);if(current<=previous)ordered=false;previous=current;
 }
 camera.keyframes=ordered?keys:[...keys].sort((a,b)=>frame(a)-frame(b)).filter((key,index,sorted)=>!index||frame(sorted[index-1])!==frame(key));
 return camera;
}
/** Conservative local filter bounds shared by live and portable renderers. */
export function filterSceneBounds(node,cameraOptions){
 const padding=180;
 const widthRange=trackRange(node,'width'),heightRange=trackRange(node,'height'),width=widthRange[1],height=heightRange[1];
 let minX=0,minY=0,maxX=width,maxY=height;
 if(node.type==='text'){
  const lines=String(node.text).split(/\r?\n/);
  maxX=Math.max(width,...lines.map(line=>line.length*node.fontSize*1.1));maxY=Math.max(height,lines.length*node.fontSize*1.2);
 }else if(node.type==='mesh'){
  const camera=cameraForBounds(cameraOptions);
  const depth=Math.min(width,height),radius=['torus','sphere'].includes(node.primitive)?Math.max(width,height)/2:Math.hypot(width,height,depth)/2;
  const minDistance=trackRange(camera,'distance')[0],minFov=trackRange(camera,'fov')[0];
  const zRange=trackRange(node,'z'),nearest=minDistance-Math.max(...zRange.map(Math.abs))-radius;
  if(nearest<=1)throw new Error('A filtered 3D layer intersects the camera safety region. Reduce its size or depth, move the camera back, or remove its effects.');
  const projectedRadius=radius*800*Math.tan(Math.PI/8)/(Math.tan(minFov*Math.PI/360)*nearest);
  // Camera orbit can shift a depth-offset object relative to the local center.
  const offset=Math.max(...zRange.map(Math.abs))*800*Math.tan(Math.PI/8)/(Math.tan(minFov*Math.PI/360)*nearest);
  minX=Math.min(0,widthRange[0]/2-projectedRadius-offset);minY=Math.min(0,heightRange[0]/2-projectedRadius-offset);
  maxX=Math.max(width,width/2+projectedRadius+offset);maxY=Math.max(height,height/2+projectedRadius+offset);
 }
 return {x:minX-padding,y:minY-padding,width:maxX-minX+padding*2,height:maxY-minY+padding*2};
}
export function normalizeNode(n,i=0){
 if(!n || typeof n!=='object')throw new Error('Invalid scene node');
 const type=['rect','ellipse','text','path','mesh'].includes(n.type)?n.type:'rect';
 const node={id:str(n.id,`node${i}`,100).replace(/[^\w-]/g,'')||`node${i}`,name:str(n.name,'Layer',100),type,
 x:finite(n.x),y:finite(n.y),width:finite(n.width,160,1,10000),height:finite(n.height,100,1,10000),
 fill:safeColor(n.fill),stroke:safeColor(n.stroke,'none'),strokeWidth:finite(n.strokeWidth,0,0,100),
 rotation:finite(n.rotation),opacity:finite(n.opacity,1,0,1),scale:finite(n.scale,1,0.001,100),
 rotationX:finite(n.rotationX),rotationY:finite(n.rotationY),z:finite(n.z,0,-300,300),blur:finite(n.blur,0,0,30),glow:finite(n.glow,0,0,30),blendMode:['normal','multiply','screen','overlay'].includes(n.blendMode)?n.blendMode:'normal',
 text:str(n.text,'Text',5000),fontSize:finite(n.fontSize,48,1,1000),fontWeight:finite(n.fontWeight,600,100,900),
 visible:n.visible!==false,locked:n.locked===true,rx:finite(n.rx,0,0,1000),
 d:str(n.d,'',50000).replace(/[^MmLlHhVvCcSsQqTtAaZz0-9., eE+\-]/g,''),keyframes:[]};
 node.maskType=MASK_TYPES.includes(n.maskType)?n.maskType:'none';
 for(const property of MASK_PROPERTIES)node[property]=boundedProperty(n[property],property,property==='maskWidth'?node.width:property==='maskHeight'?node.height:0);
 if(type==='text'&&node.text.split('\n').length>MAX_TEXT_LINES_PER_NODE)throw new Error(`A text layer supports at most ${MAX_TEXT_LINES_PER_NODE} lines`);
 // Preserve source path geometry so editing W/H also scales actual vector output.
 if(type==='path'){node.pathWidth=finite(n.pathWidth,node.width,1,10000);node.pathHeight=finite(n.pathHeight,node.height,1,10000);}
 if(type==='mesh'){node.primitive=Object.hasOwn(MESH_TRIANGLES,n.primitive)?n.primitive:'box';node.wireframe=n.wireframe===true;}
 if(Array.isArray(n.keyframes))node.keyframes=n.keyframes.slice(0,1000).map(k=>{
  if(!k||typeof k!=='object')throw new Error('Invalid keyframe');
  const f={frame:Math.round(finite(k.frame,0,0,36000)),easing:easings.has(k.easing)?k.easing:'easeInOut'};
  if(f.easing==='bezier')f.bezier=normalizeBezier(k.bezier);
  for(const p of ANIMATED_PROPERTIES)if(k[p]!==undefined)f[p]=boundedProperty(k[p],p,node[p]);
  if(k.curves&&typeof k.curves==='object'&&!Array.isArray(k.curves)){
   const curves={};for(const property of ANIMATED_PROPERTIES)if(Object.hasOwn(k.curves,property))curves[property]=normalizeTiming(k.curves[property]);
   if(Object.keys(curves).length)f.curves=curves;
  }
  return f;
 }).sort((a,b)=>a.frame-b.frame).filter((k,i,a)=>!i||a[i-1].frame!==k.frame);
 return node;
}
export function validateProject(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Expected a Rash project');
 if(p.version!==1)throw new Error('Unsupported Rash project version');
 if(!Array.isArray(p.nodes)||p.nodes.length>MAX_NODES)throw new Error(`A scene supports at most ${MAX_NODES} layers`);
 if(p.nodes.reduce((sum,n)=>sum+(Array.isArray(n?.keyframes)?n.keyframes.length:0),Array.isArray(p.camera?.keyframes)?p.camera.keyframes.length:0)>10000)throw new Error('A scene supports at most 10,000 keyframes, including camera keys');
 let overrideCount=0;
 for(const node of p.nodes)for(const key of Array.isArray(node?.keyframes)?node.keyframes:[]){
  if(!key?.curves||typeof key.curves!=='object'||Array.isArray(key.curves))continue;
  for(const property of ANIMATED_PROPERTIES)if(Object.hasOwn(key.curves,property)&&++overrideCount>MAX_TIMING_OVERRIDES)throw new Error('A scene supports at most 20,000 property timing overrides');
 }
 const out={version:1,id:str(p.id,uid(),100),name:str(p.name,'Untitled project',120),width:Math.round(finite(p.width,1280,16,4096)),height:Math.round(finite(p.height,720,16,4096)),fps:Math.round(finite(p.fps,30,1,120)),duration:Math.round(finite(p.duration,240,1,36000)),background:safeColor(p.background,'#111522'),camera:normalizeCamera(p.camera),nodes:p.nodes.map(normalizeNode),script:str(p.script,'',50000)};
 if(new Set(out.nodes.map(n=>n.id)).size!==out.nodes.length)throw new Error('Layer IDs must be unique');
 if(out.nodes.reduce((sum,n)=>sum+(n.type==='text'?n.text.split('\n').length:0),0)>MAX_TEXT_LINES)throw new Error(`A scene supports at most ${MAX_TEXT_LINES} text lines`);
 const meshes=out.nodes.filter(n=>n.type==='mesh');
 if(meshes.length>MAX_MESHES)throw new Error(`A scene supports at most ${MAX_MESHES} 3D layers`);
 if(meshes.reduce((sum,n)=>sum+MESH_TRIANGLES[n.primitive],0)>MAX_MESH_TRIANGLES)throw new Error(`A scene supports at most ${MAX_MESH_TRIANGLES} 3D triangles. Use fewer sphere or torus layers.`);
 const effectNodes=out.nodes.filter(hasNodeEffects);
 if(effectNodes.length>MAX_EFFECT_LAYERS)throw new Error(`A scene supports at most ${MAX_EFFECT_LAYERS} layers with blur or glow`);
 let effectArea=0;
 for(const node of effectNodes){const bounds=filterSceneBounds(node,out.camera),area=bounds.width*bounds.height;if(!Number.isFinite(area)||area>MAX_EFFECT_AREA)throw new Error(`Blur or glow on ${node.name} exceeds the 16 million pixel filter budget. Reduce its dimensions, text size, depth, or effects.`);effectArea+=area;}
 if(effectArea>MAX_SCENE_EFFECT_AREA)throw new Error('Scene effects exceed the 32 million pixel filter budget. Reduce the number or size of filtered layers.');
 return out;
}
export const cloneProject=p=>structuredClone(p);
export const serializeProject=p=>JSON.stringify(validateProject(p),null,2);
export function parseProject(text){if(typeof text!=='string'||text.length>5_000_000)throw new Error('Project exceeds the 5 MB import limit');return validateProject(JSON.parse(text));}
export function ease(t,kind='easeInOut',bezier){
 t=Math.max(0,Math.min(1,t));
 if(t===0||t===1)return kind==='step'?0:t;
 if(kind==='bezier'){
  const [x1,y1,x2,y2]=normalizeBezier(bezier);
  const curve=(u,a,b)=>3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*b+u*u*u;
  let lo=0,hi=1,u=t;
  // Bisection works even when the x derivative is zero at an endpoint.
  for(let i=0;i<26;i++){u=(lo+hi)/2;if(curve(u,x1,x2)<t)lo=u;else hi=u;}
  return curve(u,y1,y2);
 }
 if(kind==='bounce'){const a=7.5625,b=2.75;if(t<1/b)return a*t*t;if(t<2/b)return a*(t-=1.5/b)*t+.75;if(t<2.5/b)return a*(t-=2.25/b)*t+.9375;return a*(t-=2.625/b)*t+.984375;}
 if(kind==='elastic')return 2**(-10*t)*Math.sin((t*10-.75)*(2*Math.PI/3))+1;
 return kind==='linear'?t:kind==='easeIn'?t*t:kind==='easeOut'?1-(1-t)*(1-t):kind==='step'?0:t*t*(3-2*t);
}
export function evaluateNode(node,frame){
 const n={...node}; const keys=node.keyframes||[];
 for(const prop of ANIMATED_PROPERTIES){
  const relevant=keys.filter(k=>Number.isFinite(k[prop]));if(!relevant.length)continue;
  let previous={frame:0,[prop]:node[prop]};
  for(const next of relevant){
   if(frame<next.frame){const timing=timingSource(next,prop),t=ease((frame-previous.frame)/(next.frame-previous.frame),timing?.easing,timing?.bezier);n[prop]=boundedProperty(previous[prop]+(next[prop]-previous[prop])*t,prop,node[prop]);break;}
   previous=next;n[prop]=next[prop];
  }
 }
 return n;
}
export const evaluateScene=(p,frame)=>p.nodes.map(n=>evaluateNode(n,Math.max(0,Math.min(p.duration-1,Number(frame)||0))));
export function evaluateCamera(camera,frame){
 const pose=Object.fromEntries(CAMERA_PROPERTIES.map(property=>[property,boundedCameraProperty(camera?.[property],property)]));
 const keys=Array.isArray(camera?.keyframes)?camera.keyframes:[];
 frame=finite(frame,0,0,36000);
 for(const property of CAMERA_PROPERTIES){
  const relevant=keys.filter(key=>key&&Number.isFinite(key[property]));let previous={frame:0,[property]:pose[property]};
  for(const next of relevant){
   if(frame<next.frame){const t=ease((frame-previous.frame)/(next.frame-previous.frame),next.easing,next.bezier);pose[property]=boundedCameraProperty(previous[property]+(next[property]-previous[property])*t,property,pose[property]);break;}
   previous=next;pose[property]=boundedCameraProperty(next[property],property,pose[property]);
  }
 }
 return pose;
}
export function addCameraKeyframe(project,frame,values={},timing={easing:'easeInOut'}){
 if(!Number.isFinite(frame)||Math.round(frame)<0||Math.round(frame)>=project.duration)throw new Error('Camera keyframe must be within the composition timeline');
 if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Camera pose must be an object');
 for(const property of Object.keys(values))if(!CAMERA_PROPERTIES.includes(property)||!Number.isFinite(values[property]))throw new Error('Camera poses accept finite yaw, pitch, distance and fov values only');
 const candidate=cloneProject(project);candidate.camera=normalizeCamera(candidate.camera);frame=Math.round(frame);
 let key=candidate.camera.keyframes.find(key=>key.frame===frame);
 if(!key){if(candidate.camera.keyframes.length>=MAX_CAMERA_KEYFRAMES)throw new Error('A camera supports at most 1,000 keyframes');key={frame};candidate.camera.keyframes.push(key);candidate.camera.keyframes.sort((a,b)=>a.frame-b.frame);}
 const pose=evaluateCamera(project.camera,frame);
 Object.assign(key,pose,values,normalizeTiming(timing));if(key.easing!=='bezier')delete key.bezier;
 const validated=validateProject(candidate);project.camera=validated.camera;
 return project.camera.keyframes.find(key=>key.frame===frame);
}
export function addNode(p,type='rect'){
 if(p.nodes.length>=MAX_NODES)throw new Error('Layer limit reached');
 if(type==='mesh'&&p.nodes.filter(n=>n.type==='mesh').length>=MAX_MESHES)throw new Error('3D layer limit reached');
 if(type==='mesh'&&p.nodes.reduce((sum,n)=>sum+(n.type==='mesh'?(MESH_TRIANGLES[n.primitive]||12):0),0)+MESH_TRIANGLES.box>MAX_MESH_TRIANGLES)throw new Error('3D triangle limit reached');
 const n=normalizeNode({id:uid(),name:`${type==='text'?'Text':type==='ellipse'?'Ellipse':type==='path'?'Path':type==='mesh'?'3D box':'Rectangle'} ${p.nodes.length+1}`,type,x:p.width/2-100,y:p.height/2-60,width:200,height:120,fill:type==='text'?'#f7f6f2':'#ff6b35',rx:12,text:'Your next idea',fontSize:52});
 p.nodes.push(n);return n;
}
export function addKeyframe(p,id,frame){
 const n=p.nodes.find(n=>n.id===id);if(!n||n.locked)return;
 const f=Math.round(Math.max(0,Math.min(p.duration-1,frame)));const current=evaluateNode(n,f);
 let k=n.keyframes.find(k=>k.frame===f);if(!k){k={frame:f,easing:'easeInOut'};n.keyframes.push(k);n.keyframes.sort((a,b)=>a.frame-b.frame);}
 for(const prop of ANIMATED_PROPERTIES)k[prop]=current[prop];return k;
}
function maskCandidate(project,id){
 const candidate=cloneProject(project),index=candidate.nodes.findIndex(node=>node.id===id);
 if(index<0)throw new Error('The selected layer no longer exists');
 const node=candidate.nodes[index];
 if(node.locked)throw new Error(`Unlock ${node.name} before editing its mask`);
 return {candidate,node,index};
}
/** Fit only the mask tracks, with validation before publishing any mutation. */
export function fitNodeMask(project,id,frame=0){
 if(!Number.isFinite(frame)||Math.round(frame)<0||Math.round(frame)>=project.duration)throw new Error('Mask frame must be within the composition timeline');
 const {candidate,node,index}=maskCandidate(project,id);frame=Math.round(frame);
 const current=evaluateNode(node,frame);
 if(!Number.isFinite(current.width)||!Number.isFinite(current.height)||current.width<0||current.height<0||current.width>10000||current.height>10000)throw new Error('A fitted mask must fit within the 10,000 pixel size limit');
 const values={maskX:0,maskY:0,maskWidth:current.width,maskHeight:current.height,maskRotation:0};
 node.maskType=node.maskType==='ellipse'?'ellipse':'rect';
 let key=node.keyframes.find(key=>key.frame===frame);
 if(frame===0){Object.assign(node,values);if(key)Object.assign(key,values);}
 else{
  if(!key){if(node.keyframes.length>=1000)throw new Error('A fitted mask would exceed the 1,000 keyframe layer limit');key={frame,easing:'easeInOut'};node.keyframes.push(key);node.keyframes.sort((a,b)=>a.frame-b.frame);}
  Object.assign(key,values);
 }
 if(node.keyframes.length>1000)throw new Error('A layer supports at most 1,000 keyframes');
 const validated=validateProject(candidate);
 project.nodes[index]=validated.nodes[index];return project.nodes[index];
}
/** Disabling a mask removes only its animation and leaves other timing intact. */
export function removeNodeMask(project,id){
 const {candidate,node,index}=maskCandidate(project,id);
 node.maskType='none';
 for(const key of node.keyframes){
  for(const property of MASK_PROPERTIES){delete key[property];if(key.curves)delete key.curves[property];}
  if(key.curves&&!Object.keys(key.curves).length)delete key.curves;
 }
 node.keyframes=node.keyframes.filter(key=>ANIMATED_PROPERTIES.some(property=>Number.isFinite(key[property])));
 if(node.keyframes.length>1000)throw new Error('A layer supports at most 1,000 keyframes');
 const validated=validateProject(candidate);
 project.nodes[index]=validated.nodes[index];return project.nodes[index];
}
export function createProject(template='orbit',preset='web'){
 const size=presets.find(p=>p.id===preset)||presets[0];
 const p={version:1,...size,id:uid(),name:templates.find(t=>t.id===template)?.name.split(' / ')[0]||'Untitled',fps:30,duration:240,background:'#111522',camera:{...DEFAULT_CAMERA,keyframes:[]},nodes:[],script:'// RashScript: a bounded ActionScript-inspired runtime\ntrace("Hello, Rash.");\n'};
 const W=p.width,H=p.height,s=Math.min(W/1280,H/720);
 const node=(name,type,x,y,w,h,extra={})=>{const n=normalizeNode({id:uid(),name,type,x:x*W/1280,y:y*H/720,width:w*W/1280,height:h*H/720,...extra});p.nodes.push(n);return n;};
 const text=(name,txt,x,y,size,color='#f3f1ec')=>node(name,'text',x,y,1000,100,{text:txt,fontSize:size*s,fill:color,fontWeight:700});
 if(template==='blank'){p.name='Untitled project';p.background='#f8f7f4';return p;}
 if(template==='dimension'){
  p.background='#10131e';
  p.camera.keyframes=[{frame:0,yaw:-8,pitch:0,easing:'easeInOut'},{frame:120,yaw:8,pitch:4,easing:'easeInOut'},{frame:239,yaw:-8,pitch:0,easing:'easeInOut'}];
  text('Eyebrow','R A S H   /   BEYOND THE FLAT',76,62,15,'#98adae');
  node('Horizon','rect',76,583,1128,1,{fill:'#344044'});
  const ring=node('Orbital torus','mesh',742,118,400,400,{primitive:'torus',fill:'#7defd2',rotationX:28,rotationY:-28,glow:2});
  ring.keyframes=[{frame:0,rotationX:28,rotationY:-28},{frame:120,rotationX:95,rotationY:152,easing:'linear'},{frame:239,rotationX:208,rotationY:332,easing:'linear'}];
  const cube=node('Floating cube','mesh',961,411,120,120,{primitive:'box',fill:'#b198ff',rotationX:24,rotationY:35,z:45});
  cube.keyframes=[{frame:0,y:cube.y,rotationY:35},{frame:120,y:cube.y-35*s,rotationY:215,easing:'easeInOut'},{frame:239,y:cube.y,rotationY:395,easing:'easeInOut'}];
  const headline=text('Headline / Beyond','Beyond',73,189,110);headline.keyframes=[{frame:0,y:headline.y},{frame:70,y:headline.y-8*s,easing:'easeInOut'},{frame:239,y:headline.y,easing:'easeInOut'}];
  text('Headline / dimensions','dimensions.',73,310,88,'#7defd2');
  text('Description','Give your next idea a new perspective.',80,453,22,'#acb7c3');
  text('Edition','REAL GEOMETRY. INFINITE EXPRESSION.',80,617,13,'#bfc8d0');
  text('Format','THREE.JS  /  SVG  /  MOTION',889,617,12,'#7defd2');
 } else if(template==='mask'){
  p.background='#111925';
  text('Eyebrow','R A S H   /   THE ART OF REVEAL',76,64,15,'#99b3b3');
  const title=node('Wipe / headline','text',76,207,660,125,{text:'A little mystery.',fontSize:78*s,fontWeight:700,fill:'#f4f2ec',maskType:'rect'});
  title.keyframes=[{frame:0,maskWidth:0},{frame:75,maskWidth:title.width,easing:'bezier',bezier:[.16,1,.3,1]}];
  const underline=node('Wipe / accent','rect',82,352,580,9,{fill:'#7defd2',maskType:'rect',rx:4});
  underline.keyframes=[{frame:0,maskWidth:0},{frame:25,maskWidth:0},{frame:95,maskWidth:underline.width,easing:'easeInOut'}];
  const orb=node('Iris / geometry','mesh',840,178,270,270,{primitive:'torus',fill:'#b7a1ff',rotationX:26,rotationY:-25,maskType:'ellipse'});
  const mw=orb.width*Math.SQRT2,mh=orb.height*Math.SQRT2;
  orb.keyframes=[{frame:0,maskX:orb.width/2,maskY:orb.height/2,maskWidth:0,maskHeight:0},{frame:20,maskX:orb.width/2,maskY:orb.height/2,maskWidth:0,maskHeight:0},{frame:110,maskX:(orb.width-mw)/2,maskY:(orb.height-mh)/2,maskWidth:mw,maskHeight:mh,easing:'easeOut'}];
  text('Description','Build anticipation. Reveal something remarkable.',82,426,20,'#a6b5c4');
  node('Footer rule','rect',76,604,1128,1,{fill:'#34444e'});
  text('Edition','GEOMETRIC MASKS. EDITABLE AT EVERY FRAME.',76,636,13,'#a6b5c4');
  text('Format','WIPE  /  IRIS  /  SVG',946,636,12,'#7defd2');
 } else if(template==='orbit'){
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
