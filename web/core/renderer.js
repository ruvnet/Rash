import {evaluateScene,validateProject} from './model.js';
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
const tag=n=>n.type==='ellipse'?'ellipse':n.type==='text'?'text':n.type==='path'?'path':'rect';
function transform(n){return `translate(${num(n.x)} ${num(n.y)}) rotate(${num(n.rotation)} ${num(n.width/2)} ${num(n.height/2)}) translate(${num(n.width/2)} ${num(n.height/2)}) scale(${num(n.scale??1)}) translate(${num(-n.width/2)} ${num(-n.height/2)})`;}
function set(el,key,value){const text=String(value);if(el.getAttribute(key)!==text)el.setAttribute(key,text);}
const caches=new WeakMap();
export function textMarkup(text){return String(text).split(/\r?\n/).map((line,index)=>`<tspan x="0" dy="${index?'1.2em':'0'}">${esc(line)||'&#160;'}</tspan>`).join('');}
export function renderScene(svg,project,frame=0,options={}){
 set(svg,'viewBox',`0 0 ${project.width} ${project.height}`);set(svg,'xmlns',NS);
 let cache=caches.get(svg);if(!cache){svg.replaceChildren();const bg=document.createElementNS(NS,'rect');bg.setAttribute('data-background','');svg.append(bg);cache={bg,nodes:new Map(),selection:null};caches.set(svg,cache);}
 for(const [k,v]of Object.entries({width:project.width,height:project.height,fill:project.background}))set(cache.bg,k,v);
 const nodes=evaluateScene(project,frame);const wanted=new Set(nodes.map(n=>n.id));
 for(const [id,entry] of cache.nodes)if(!wanted.has(id)){entry.g.remove();cache.nodes.delete(id);}
 nodes.forEach((n,index)=>{
  let entry=cache.nodes.get(n.id);
  if(!entry||entry.type!==n.type){entry?.g.remove();const g=document.createElementNS(NS,'g');const shape=document.createElementNS(NS,tag(n));g.append(shape);entry={g,shape,type:n.type};cache.nodes.set(n.id,entry);}
  const {g,shape}=entry;set(g,'data-node-id',n.id);set(g,'transform',transform(n));set(g,'opacity',n.opacity);set(g,'display',n.visible?'inline':'none');set(g,'style',`cursor:${n.locked?'default':'move'}`);g.onclick=options.onSelect?e=>{e.stopPropagation();if(!n.locked)options.onSelect(n.id,e);}:null;
  for(const [k,v]of Object.entries(nodeAttributes(n)))set(shape,k,v);
  if(n.type==='text'&&entry.text!==n.text){shape.replaceChildren(...String(n.text).split(/\r?\n/).map((line,index)=>{const span=document.createElementNS(NS,'tspan');span.setAttribute('x','0');span.setAttribute('dy',index?'1.2em':'0');span.textContent=line||'\u00a0';return span;}));entry.text=n.text;}
  if(svg.children[index+1]!==g)svg.insertBefore(g,svg.children[index+1]||null);
 });
 cache.selection?.remove();cache.selection=null;
 const selected=nodes.find(n=>n.id===options.selectedId&&n.visible);
 if(selected){
  const g=document.createElementNS(NS,'g');g.setAttribute('data-selection','');g.setAttribute('pointer-events','none');g.setAttribute('transform',transform(selected));
  const rect=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries({x:-3,y:-3,width:selected.width+6,height:selected.height+6,fill:'none',stroke:'#ff713e','stroke-width':1.5,'vector-effect':'non-scaling-stroke'}))rect.setAttribute(k,v);g.append(rect);
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
 const p=validateProject(input);const nodes=evaluateScene(p,frame);
 return `<svg xmlns="${NS}" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title><rect width="100%" height="100%" fill="${esc(p.background)}"/>${nodes.filter(n=>n.visible).map(n=>`<g data-node-id="${esc(n.id)}" transform="${transform(n)}" opacity="${n.opacity}"><${tag(n)}${attr(nodeAttributes(n))}>${n.type==='text'?textMarkup(n.text):''}</${tag(n)}></g>`).join('')}</svg>`;
}
