import {evaluateScene,evaluateCamera,evaluateSymbolFrame,validateProject,safeColor,filterSceneBounds,hasNodeEffects,MESH_TRIANGLES} from './model.js';
import {meshPaths} from './three-svg.js';
const NS='http://www.w3.org/2000/svg';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const num=v=>Math.round((Number(v)||0)*1000)/1000;
export function nodeAttributes(n){
 const common={fill:n.fill,stroke:n.stroke,'stroke-width':n.strokeWidth};
 if(n.type==='ellipse')return {...common,cx:n.width/2,cy:n.height/2,rx:n.width/2,ry:n.height/2};
 if(n.type==='text')return {...common,x:0,y:n.fontSize,'font-size':n.fontSize,'font-weight':n.fontWeight||600,'font-family':'Inter, Arial, sans-serif','xml:space':'preserve'};
 if(n.type==='path')return {...common,d:n.d||'',transform:`scale(${num(n.width/(n.pathWidth||n.width))} ${num(n.height/(n.pathHeight||n.height))})`};
 return {...common,x:0,y:0,width:n.width,height:n.height,rx:n.rx||0};
}
const tag=n=>n.type==='mesh'||n.type==='symbol'?'g':n.type==='ellipse'?'ellipse':n.type==='text'?'text':n.type==='path'?'path':'rect';
function transform(n){return `translate(${num(n.x)} ${num(n.y)}) rotate(${num(n.rotation)} ${num(n.width/2)} ${num(n.height/2)}) translate(${num(n.width/2)} ${num(n.height/2)}) scale(${num(n.scale??1)}) translate(${num(-n.width/2)} ${num(-n.height/2)})`;}
function set(el,key,value){const text=String(value);if(el.getAttribute(key)!==text)el.setAttribute(key,text);}
const caches=new WeakMap();
let rendererSequence=0;
const effectStrength=v=>Number.isFinite(v)?Math.max(0,Math.min(30,v)):0;
const hasEffect=hasNodeEffects;
export const effectId=(id,prefix='rash')=>`${String(prefix).replace(/[^\w-]/g,'')}-effect-${String(id).replace(/[^\w-]/g,'')}`;
export const effectFilter=(n,prefix='rash')=>hasEffect(n)?`url(#${effectId(n.id,prefix)})`:null;
export const groupStyle=n=>`mix-blend-mode:${['multiply','screen','overlay'].includes(n.blendMode)?n.blendMode:'normal'}`;
const hasMask=n=>n.maskType==='rect'||n.maskType==='ellipse';
const maskTag=n=>n.maskType==='ellipse'?'ellipse':'rect';
const maskNumber=(value,fallback,min=-100000,max=100000)=>num(Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback);
export const maskId=(id,prefix='rash')=>`${String(prefix).replace(/[^\w-]/g,'')}-mask-${String(id).replace(/[^\w-]/g,'')}`;
export const maskReference=(n,prefix='rash')=>hasMask(n)?`url(#${maskId(n.id,prefix)})`:null;
/** Allowlisted local geometry shared by retained, still, and animated output. */
export function maskAttributes(n){
 const x=maskNumber(n.maskX,0),y=maskNumber(n.maskY,0);
 const width=maskNumber(n.maskWidth,maskNumber(n.width,160,0,10000),0,10000),height=maskNumber(n.maskHeight,maskNumber(n.height,100,0,10000),0,10000);
 const cx=num(x+width/2),cy=num(y+height/2),rotation=maskNumber(n.maskRotation,0);
 return {...(n.maskType==='ellipse'?{cx,cy,rx:num(width/2),ry:num(height/2)}:{x,y,width,height}),transform:`rotate(${rotation} ${cx} ${cy})`};
}
export function maskMarkup(n,prefix='rash'){
 return hasMask(n)?`<clipPath${attr({id:maskId(n.id,prefix),clipPathUnits:'userSpaceOnUse'})}><${maskTag(n)}${attr(maskAttributes(n))}/></clipPath>`:'';
}
function renderMask(cache,n,key=n.id,prefix=cache.prefix){
 let entry=cache.masks.get(key);
 if(!hasMask(n)){entry?.clip.remove();cache.masks.delete(key);return;}
 if(!entry){const clip=document.createElementNS(NS,'clipPath');set(clip,'id',maskId(n.id,prefix));set(clip,'clipPathUnits','userSpaceOnUse');cache.defs.append(clip);entry={clip};cache.masks.set(key,entry);}
 set(entry.clip,'id',maskId(n.id,prefix));
 if(entry.type!==n.maskType){entry.shape=document.createElementNS(NS,maskTag(n));entry.clip.replaceChildren(entry.shape);entry.type=n.maskType;}
 for(const [key,value]of Object.entries(maskAttributes(n)))set(entry.shape,key,value);
}
const glowColor=n=>safeColor(n.fill==='none'||n.fill==='transparent'?n.stroke:n.fill,'#ffffff');
function effectAttributes(n,prefix,camera,authored=n){
 const bounds=filterSceneBounds(authored,camera);
 return {id:effectId(n.id,prefix),filterUnits:'userSpaceOnUse',...Object.fromEntries(Object.entries(bounds).map(([key,value])=>[key,num(value)])),'color-interpolation-filters':'sRGB'};
}
export function effectMarkup(n,prefix='rash',camera,authored=n){
 if(!hasEffect(n))return '';
 return `<filter${attr(effectAttributes(n,prefix,camera,authored))}><feGaussianBlur stdDeviation="${effectStrength(n.blur)}"/><feDropShadow dx="0" dy="0" stdDeviation="${effectStrength(n.glow)}" flood-color="${esc(glowColor(n))}" flood-opacity="${effectStrength(n.glow)>0?1:0}"/></filter>`;
}
function renderEffect(cache,n,camera,authored,key=n.id,prefix=cache.prefix){
 let entry=cache.effects.get(key);
 if(!hasEffect(n)){entry?.filter.remove();cache.effects.delete(key);return;}
 if(!entry){
  const filter=document.createElementNS(NS,'filter'),blur=document.createElementNS(NS,'feGaussianBlur'),glow=document.createElementNS(NS,'feDropShadow');
  filter.append(blur,glow);cache.defs.append(filter);entry={filter,blur,glow};cache.effects.set(key,entry);
 }
 for(const [key,value]of Object.entries(effectAttributes(n,prefix,camera,authored)))set(entry.filter,key,value);
 set(entry.blur,'stdDeviation',effectStrength(n.blur));
 for(const [key,value]of Object.entries({dx:0,dy:0,stdDeviation:effectStrength(n.glow),'flood-color':glowColor(n),'flood-opacity':effectStrength(n.glow)>0?1:0}))set(entry.glow,key,value);
}
function faceAttributes(face){return {'data-face-id':face.id,d:face.d,fill:face.fill,'fill-opacity':face.fillOpacity,stroke:face.stroke,'stroke-width':face.strokeWidth,'stroke-linejoin':'round'};}
function renderMesh(entry,n,camera){
 const faces=meshPaths(n,camera),wanted=new Set(faces.map(face=>face.id));
 entry.faces??=new Map();
 for(const [id,path]of entry.faces)if(!wanted.has(id)){path.remove();entry.faces.delete(id);}
 faces.forEach((face,index)=>{
  let path=entry.faces.get(face.id);if(!path){path=document.createElementNS(NS,'path');entry.faces.set(face.id,path);}
  for(const [key,value]of Object.entries(faceAttributes(face)))set(path,key,value);
  if(entry.shape.children[index]!==path)entry.shape.insertBefore(path,entry.shape.children[index]||null);
 });
}
export function textMarkup(text){return String(text).split(/\r?\n/).map((line,index)=>`<tspan x="0" dy="${index?'1.2em':'0'}">${esc(line)||'&#160;'}</tspan>`).join('');}
export function renderScene(svg,project,frame=0,options={}){
 set(svg,'viewBox',`0 0 ${project.width} ${project.height}`);set(svg,'xmlns',NS);
 let cache=caches.get(svg);if(!cache){svg.replaceChildren();const bg=document.createElementNS(NS,'rect'),defs=document.createElementNS(NS,'defs');bg.setAttribute('data-background','');svg.append(defs,bg);cache={bg,defs,prefix:`rash-view-${++rendererSequence}`,nodes:new Map(),effects:new Map(),masks:new Map(),selection:null};caches.set(svg,cache);}
 for(const [k,v]of Object.entries({width:project.width,height:project.height,fill:project.background}))set(cache.bg,k,v);
 const nodes=evaluateScene(project,frame),wanted=new Set(),symbols=new Map((project.symbols||[]).map(s=>[s.id,s]));
 const rootFrame=Math.max(0,Math.min(project.duration-1,Number(frame)||0));
 function renderNodes(parent,scene,localFrame,path=[],owner=null,offset=0,evaluated=evaluateScene(scene,localFrame)){
  const camera=evaluateCamera(scene.camera,localFrame);
  evaluated.forEach((n,index)=>{
   const fullPath=[...path,n.id],key=fullPath.join('/'),prefix=project.version===2?instancePrefix(cache.prefix,fullPath):cache.prefix;
   wanted.add(key);let entry=cache.nodes.get(key);
   if(!entry||entry.type!==n.type){entry?.g.remove();const g=document.createElementNS(NS,'g'),shape=document.createElementNS(NS,tag(n));g.append(shape);entry={g,shape,type:n.type};cache.nodes.set(key,entry);}
   const {g,shape}=entry,selectedOwner=owner||n;
   // Nested hits select the outer instance in the editor. The separate path is
   // stable for retained identity, diagnostics, and repeated symbol definitions.
   set(g,'data-node-id',selectedOwner.id);
   if(path.length){set(g,'data-symbol-node-id',n.id);set(g,'data-instance-path',key);}else{g.removeAttribute('data-symbol-node-id');g.removeAttribute('data-instance-path');}
   set(g,'transform',transform(n));set(g,'opacity',n.opacity);set(g,'display',n.visible?'inline':'none');set(g,'style',`cursor:${selectedOwner.locked?'default':'move'};${groupStyle(n)}`);
   g.onclick=options.onSelect?e=>{e.stopPropagation();if(!selectedOwner.locked)options.onSelect(selectedOwner.id,e);}:null;
   if(n.type==='symbol'){
    const definition=symbols.get(n.symbolId);
    if(!definition)throw new Error(`Missing symbol definition: ${n.symbolId}`);
    set(shape,'data-symbol-content',n.symbolId);set(shape,'transform',`scale(${symbolScale(n,definition)})`);
    renderNodes(shape,definition,evaluateSymbolFrame(n,localFrame,definition),fullPath,selectedOwner);
   }else if(n.type==='mesh')renderMesh(entry,n,camera);else for(const [k,v]of Object.entries(nodeAttributes(n)))set(shape,k,v);
   renderEffect(cache,n,scene.camera,scene.nodes[index],key,prefix);const filter=effectFilter(n,prefix);if(filter)set(g,'filter',filter);else g.removeAttribute('filter');
   renderMask(cache,n,key,prefix);const clip=maskReference(n,prefix);if(clip)set(g,'clip-path',clip);else g.removeAttribute('clip-path');
   if(n.type==='text'&&entry.text!==n.text){shape.replaceChildren(...String(n.text).split(/\r?\n/).map((line,index)=>{const span=document.createElementNS(NS,'tspan');span.setAttribute('x','0');span.setAttribute('dy',index?'1.2em':'0');span.textContent=line||'\u00a0';return span;}));entry.text=n.text;}
   if(parent.children[index+offset]!==g)parent.insertBefore(g,parent.children[index+offset]||null);
  });
 }
 renderNodes(svg,project,rootFrame,[],null,2,nodes);
 for(const [id,entry]of cache.nodes)if(!wanted.has(id)){entry.g.remove();cache.nodes.delete(id);}
 for(const [id,entry]of cache.effects)if(!wanted.has(id)){entry.filter.remove();cache.effects.delete(id);}
 for(const [id,entry]of cache.masks)if(!wanted.has(id)){entry.clip.remove();cache.masks.delete(id);}
 cache.selection?.remove();cache.selection=null;
 const selected=nodes.find(n=>n.id===options.selectedId&&n.visible);
 if(selected){
  const g=document.createElementNS(NS,'g');g.setAttribute('data-selection','');g.setAttribute('pointer-events','none');g.setAttribute('transform',transform(selected));
  const rect=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries({x:-3,y:-3,width:selected.width+6,height:selected.height+6,fill:'none',stroke:'#ff713e','stroke-width':1.5,'vector-effect':'non-scaling-stroke'}))rect.setAttribute(k,v);g.append(rect);
  if(hasMask(selected)){const outline=document.createElementNS(NS,maskTag(selected));for(const [key,value]of Object.entries({...maskAttributes(selected),'data-mask-outline':'',fill:'none',stroke:'#52dbca','stroke-width':1.5,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}))set(outline,key,value);g.append(outline);}
  if(!selected.locked&&selected.type!=='path'){
   const matrix=svg.getScreenCTM?.();const pixels=Math.max(.001,Math.hypot(matrix?.a||1,matrix?.b||0)*(selected.scale??1));
   const hit=32/pixels,marker=7/pixels;
   for(const [corner,x,y]of [['nw',0,0],['ne',selected.width,0],['sw',0,selected.height],['se',selected.width,selected.height]]){
    const handle=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries({x:x-hit/2,y:y-hit/2,width:hit,height:hit,fill:'transparent','pointer-events':'all','data-resize':corner,'data-resize-node':selected.id,'aria-label':`Resize ${corner} corner`,style:`cursor:${['nw','se'].includes(corner)?'nwse':'nesw'}-resize;touch-action:none`}))handle.setAttribute(k,v);g.append(handle);
    const dot=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries({x:x-marker/2,y:y-marker/2,width:marker,height:marker,fill:'#fff',stroke:'#ff713e','stroke-width':1,'vector-effect':'non-scaling-stroke'}))dot.setAttribute(k,v);g.append(dot);
   }
  }
  svg.append(g);cache.selection=g;
 }
 return svg;
}
function attr(obj){return Object.entries(obj).map(([k,v])=>` ${k}="${esc(v)}"`).join('');}
export function sceneToSVG(input,frame=0,options={}){
 const p=validateProject(input);if(p.version===2)return symbolSceneToSVG(p,frame,options);const nodes=evaluateScene(p,frame),camera=evaluateCamera(p.camera,Math.max(0,Math.min(p.duration-1,Number(frame)||0)));
 const prefix=options.prefix||'rash',effects=nodes.map((n,index)=>effectMarkup(n,prefix,p.camera,p.nodes[index])+maskMarkup(n,prefix)).join('');
 const content=nodes.filter(n=>n.visible).map(n=>{
  const filter=effectFilter(n,prefix),clip=maskReference(n,prefix);
  const shape=n.type==='mesh'?meshPaths(n,camera).map(face=>`<path${attr(faceAttributes(face))}/>`).join(''):`<${tag(n)}${attr(nodeAttributes(n))}>${n.type==='text'?textMarkup(n.text):''}</${tag(n)}>`;
  return `<g data-node-id="${esc(n.id)}" transform="${transform(n)}" opacity="${n.opacity}" style="${groupStyle(n)}"${filter?` filter="${esc(filter)}"`:''}${clip?` clip-path="${esc(clip)}"`:''}>${shape}</g>`;
 }).join('');
 return `<svg xmlns="${NS}" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title>${effects?`<defs>${effects}</defs>`:''}<rect width="100%" height="100%" fill="${esc(p.background)}"/>${content}</svg>`;
}

export const symbolScale=(node,definition)=>`${Number((node.width/definition.width).toPrecision(12))} ${Number((node.height/definition.height).toPrecision(12))}`;

/** Length prefixes make paths injective even when IDs themselves contain dashes. */
export function instancePrefix(prefix,path){return `${prefix}-instance-${path.map(id=>`${id.length}-${id}`).join('-')}`;}
function symbolSceneToSVG(p,frame,options){
 const symbols=new Map(p.symbols.map(s=>[s.id,s]));let effects='',estimatedBytes=0;
 function checkSize(scene){
  for(const node of scene.nodes){
   if(!node.visible)continue;
   estimatedBytes+=(node.text?.length||0)*6+(node.text?.split('\n').length||0)*40+(node.d?.length||0)+(node.type==='mesh'?MESH_TRIANGLES[node.primitive]*320:0)+1500;
   if(estimatedBytes>16_000_000)throw new Error('SVG scene exceeds the 16 MB output budget. Reduce scene complexity.');
   if(node.type==='symbol')checkSize(symbols.get(node.symbolId));
  }
 }
 checkSize(p);
 const rootFrame=Math.max(0,Math.min(p.duration-1,Number(frame)||0));
 function content(scene,localFrame,path=[]){
  const camera=evaluateCamera(scene.camera,localFrame);
  return evaluateScene(scene,localFrame).map((n,index)=>{
   const fullPath=[...path,n.id],prefix=instancePrefix(options.prefix||'rash',fullPath);
   effects+=effectMarkup(n,prefix,scene.camera,scene.nodes[index])+maskMarkup(n,prefix);
   if(!n.visible)return '';
   let shape;
   if(n.type==='symbol'){
    const definition=symbols.get(n.symbolId);
    shape=`<g data-symbol-content="${esc(n.symbolId)}" transform="scale(${symbolScale(n,definition)})">${content(definition,evaluateSymbolFrame(n,localFrame,definition),fullPath)}</g>`;
   }else shape=n.type==='mesh'?meshPaths(n,camera).map(face=>`<path${attr(faceAttributes(face))}/>`).join(''):`<${tag(n)}${attr(nodeAttributes(n))}>${n.type==='text'?textMarkup(n.text):''}</${tag(n)}>`;
   const filter=effectFilter(n,prefix),clip=maskReference(n,prefix);
   return `<g data-node-id="${esc(n.id)}" data-instance-path="${esc(fullPath.join('/'))}" transform="${transform(n)}" opacity="${n.opacity}" style="${groupStyle(n)}"${filter?` filter="${esc(filter)}"`:''}${clip?` clip-path="${esc(clip)}"`:''}>${shape}</g>`;
  }).join('');
 }
 const body=content(p,rootFrame);
 const svg=`<svg xmlns="${NS}" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title>${effects?`<defs>${effects}</defs>`:''}<rect width="100%" height="100%" fill="${esc(p.background)}"/>${body}</svg>`;
 if(new TextEncoder().encode(svg).byteLength>16_000_000)throw new Error('SVG scene exceeds the 16 MB output budget. Reduce scene complexity.');
 return svg;
}
