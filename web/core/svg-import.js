import {normalizeNode,safeColor,uid,validateProject} from './model.js';

const SVG_NS='http://www.w3.org/2000/svg';
const SVG_MAX_BYTES=5_000_000;
const MAX_PATH_LENGTH=50_000;
const PAINT_PROPERTIES=new Set(['fill','stroke','stroke-width','opacity']);
const BASE_ATTRIBUTES=new Set(['style','fill','stroke','stroke-width','opacity','id','data-name']);

function parsePaint(element,inherited){
 const values={...inherited};
 const declarations=new Map();
 for(const name of ['fill','stroke','stroke-width','opacity'])if(element.hasAttribute(name))declarations.set(name,element.getAttribute(name));
 const style=element.getAttribute('style');
 if(style){
  for(const declaration of style.split(';')){
   if(!declaration.trim())continue;
   const colon=declaration.indexOf(':');
   if(colon<1)throw new Error('SVG has an invalid style declaration.');
   const property=declaration.slice(0,colon).trim().toLowerCase();
   if(!PAINT_PROPERTIES.has(property))throw new Error(`SVG style "${property}" is not supported.`);
   declarations.set(property,declaration.slice(colon+1).trim());
  }
 }
 for(const [property,value]of declarations){
  if(property==='opacity'){
   const opacity=Number(value);
   if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw new Error('SVG opacity must be between 0 and 1.');
   values.opacity=opacity;
  }else if(property==='stroke-width'){
   const width=Number(value);
   if(!Number.isFinite(width)||width<0||width>100)throw new Error('SVG stroke width must be between 0 and 100.');
   values.strokeWidth=width;
  }else{
   const color=safeColor(value,'');
   if(!color)throw new Error(`SVG ${property} "${value}" is not a supported solid color.`);
   values[property]=color;
  }
 }
 return values;
}

function assertSupportedAttributes(element,allowed){
 for(const attribute of element.attributes){
  if(attribute.name.startsWith('data-')||attribute.name.startsWith('aria-'))continue;
  if(!allowed.has(attribute.name))throw new Error(`SVG attribute "${attribute.name}" on <${element.localName}> is not supported.`);
 }
}

function unionBounds(records){
 const x=Math.min(...records.map(record=>record.bounds.x)),y=Math.min(...records.map(record=>record.bounds.y));
 const right=Math.max(...records.map(record=>record.bounds.x+record.bounds.width)),bottom=Math.max(...records.map(record=>record.bounds.y+record.bounds.height));
 return {x,y,width:right-x,height:bottom-y};
}

function boundedDimension(value){
 if(!Number.isFinite(value)||value<0||value>10000)throw new Error('SVG path bounds must fit within 10,000 pixels.');
 return Math.max(1,value);
}

export function parseSvgProject(source,name='Imported SVG',{preserveGroups=true}={}){
 if(typeof source!=='string'||new TextEncoder().encode(source).byteLength>SVG_MAX_BYTES)throw new Error('SVG import is limited to 5 MB.');
 if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('SVG documents with DTDs or entities are not supported.');
 const xml=new DOMParser().parseFromString(source,'image/svg+xml');
 if(xml.querySelector('parsererror'))throw new Error('The SVG file is malformed.');
 const root=xml.documentElement;
 if(root?.namespaceURI!==SVG_NS||root.localName!=='svg')throw new Error('Choose a valid SVG document.');
 assertSupportedAttributes(root,new Set(['xmlns','xmlns:xlink','viewBox','width','height','version','id','preserveAspectRatio',...BASE_ATTRIBUTES]));
 const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
 if(box.length!==4||box.some(value=>!Number.isFinite(value))||box[2]<16||box[3]<16||box[2]>4096||box[3]>4096)throw new Error('SVG needs a viewBox with width and height between 16 and 4096.');
 const [minX,minY,sourceWidth,sourceHeight]=box;
 const width=Math.round(sourceWidth),height=Math.round(sourceHeight);
 if(width<16||height<16||width>4096||height>4096)throw new Error('SVG dimensions must be between 16 and 4096.');

 const rootPaint=parsePaint(root,{fill:'#000000',stroke:'none',strokeWidth:1,opacity:1});
 if(rootPaint.opacity!==1)throw new Error('Opacity on the SVG root is not supported.');
 const symbols=[];
 let pathCount=0,groupCount=0;
 const measureRoot=document.createElementNS(SVG_NS,'svg');
 measureRoot.setAttribute('width','1');measureRoot.setAttribute('height','1');
 measureRoot.style.cssText='position:fixed;left:-100000px;top:-100000px;visibility:hidden;pointer-events:none';
 document.body.append(measureRoot);
 try{
  function visit(parent,inherited){
   const records=[];
   for(const element of parent.children){
    if(element.namespaceURI!==SVG_NS)throw new Error('SVG contains an unsupported namespace element.');
    if(element.localName==='title'||element.localName==='desc')continue;
    if(element.localName==='g'){
     assertSupportedAttributes(element,new Set(BASE_ATTRIBUTES));
     const paint=parsePaint(element,inherited);
     if(paint.opacity!==1)throw new Error('Opacity on SVG groups is not supported.');
     const children=visit(element,paint);
     if(!children.length)continue;
     if(!preserveGroups){records.push(...children);continue;}
     const bounds=unionBounds(children);
     boundedDimension(bounds.width);boundedDimension(bounds.height);
     if(++groupCount>128)throw new Error('SVG import supports at most 128 groups.');
     const id=`s${uid()}`,groupNodes=children.map(({node})=>({...node,x:node.x-bounds.x,y:node.y-bounds.y}));
     symbols.push({id,name:(element.getAttribute('data-name')||element.getAttribute('id')||`Group ${groupCount}`).slice(0,100),width:boundedDimension(bounds.width),height:boundedDimension(bounds.height),duration:1,camera:{yaw:0,pitch:0,distance:800,fov:45,keyframes:[]},nodes:groupNodes});
     records.push({bounds,node:normalizeNode({id:uid(),name:element.getAttribute('data-name')||element.getAttribute('id')||`Group ${groupCount}`,type:'symbol',symbolId:id,x:bounds.x,y:bounds.y,width:boundedDimension(bounds.width),height:boundedDimension(bounds.height),playback:'loop',firstFrame:0,startFrame:0})});
     continue;
    }
    if(element.localName!=='path')throw new Error(`SVG element <${element.localName}> is not supported; convert it to a path first.`);
    assertSupportedAttributes(element,new Set([...BASE_ATTRIBUTES,'d']));
    if(++pathCount>1000)throw new Error('SVG import supports at most 1000 paths.');
    const d=element.getAttribute('d')||'';
    if(!d.trim()||d.length>MAX_PATH_LENGTH||/[^MmLlHhVvCcSsQqTtAaZz0-9., eE+\-]/.test(d))throw new Error('SVG contains an invalid or oversized path.');
    const paint=parsePaint(element,inherited);
    if(paint.opacity!==1&&inherited.opacity!==1)throw new Error('Opacity inherited by SVG paths is not supported.');
    const shape=document.createElementNS(SVG_NS,'path');
    shape.setAttribute('d',d);measureRoot.append(shape);
    const geometry=shape.getBBox();shape.remove();
    const halfStroke=paint.stroke==='none'?0:paint.strokeWidth/2;
    const bounds={x:geometry.x-halfStroke,y:geometry.y-halfStroke,width:Math.max(1,geometry.width+2*halfStroke),height:Math.max(1,geometry.height+2*halfStroke)};
    boundedDimension(bounds.width);boundedDimension(bounds.height);
    const node=normalizeNode({
     id:uid(),name:(element.getAttribute('data-name')||element.getAttribute('id')||`Path ${pathCount}`).slice(0,100),
     type:'path',x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,
     pathWidth:bounds.width,pathHeight:bounds.height,pathOffsetX:bounds.x,pathOffsetY:bounds.y,
     d,fill:paint.fill,stroke:paint.stroke,strokeWidth:paint.strokeWidth,opacity:paint.opacity
    },pathCount-1);
    records.push({bounds,node});
   }
   return records;
  }
  const records=visit(root,rootPaint);
  if(!records.length)throw new Error('SVG contains no importable paths.');
  const nodes=records.map(({node})=>({...node,x:node.x-minX,y:node.y-minY}));
  const project={version:symbols.length?2:1,id:uid(),name:(String(name).trim()||'Imported SVG').slice(0,120),width,height,fps:30,duration:240,background:'transparent',camera:{yaw:0,pitch:0,distance:800,fov:45,keyframes:[]},nodes,script:'',...(symbols.length?{symbols}:{})};
  return validateProject(project);
 }finally{
  measureRoot.remove();
 }
}
