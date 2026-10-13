import { validateProject, evaluateNode, evaluateCamera, evaluateSymbolFrame, ANIMATED_PROPERTIES, CAMERA_PROPERTIES, MESH_TRIANGLES } from '../core/model.js';
import { sceneToSVG, nodeAttributes, textMarkup, effectMarkup, effectFilter, groupStyle, maskId, maskReference, maskAttributes, instancePrefix, symbolScale } from '../core/renderer.js';
import { meshPaths } from '../core/three-svg.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const num = n => Math.round(n * 1000) / 1000;
const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
export function animatedSVG(input) {
  const p = validateProject(input);
  if(p.version===2)return animatedSymbolSVG(p);
  const outputLimit=16_000_000;
  const cameraMoves=p.camera.keyframes.some(key=>CAMERA_PROPERTIES.some(property=>Number.isFinite(key[property])));
  const hasMeshes=p.nodes.some(n=>n.type==='mesh');
  const geometryMoves=n=>n.type==='mesh'&&(cameraMoves||n.keyframes.some(key=>['width','height','rotationX','rotationY','z'].some(property=>Object.hasOwn(key,property))));
  const staticBytes = p.nodes.reduce((sum, n) => sum + (n.text?.length || 0) * 6 + (n.text?.split('\n').length || 0) * 40 + (n.d?.length || 0) + (n.type==='mesh'?MESH_TRIANGLES[n.primitive]*320:0) + (maskReference(n)?500:0) + 1000, 0);
  if (staticBytes > 16_000_000) throw new Error('SVG scene exceeds the 16 MB output budget. Reduce scene complexity.');
  if (!p.nodes.some(n => n.keyframes.length)&&!(cameraMoves&&hasMeshes)) return sceneToSVG(p, 0);
  const moving = p.nodes.filter(n => n.keyframes.length||geometryMoves(n)).length;
  if (moving * p.duration > 500000) throw new Error('SVG animation exceeds the 500,000 layer-frame export budget. Shorten the timeline or reduce animated layers.');
  const cameraWork=cameraMoves&&hasMeshes?p.duration*p.camera.keyframes.length*CAMERA_PROPERTIES.length:0;
  const work = cameraWork+p.nodes.reduce((sum, n) => sum + (n.keyframes.length ? (p.duration + 1) * n.keyframes.length * ANIMATED_PROPERTIES.length : 0), 0);
  if (work > 5_000_000) throw new Error('SVG animation exceeds the evaluation budget. Reduce keyframes or shorten the timeline.');
  const triangleFrames=p.nodes.reduce((sum,n)=>sum+(geometryMoves(n)?MESH_TRIANGLES[n.primitive]*p.duration:0),0);
  if(triangleFrames>200_000)throw new Error('3D SVG animation exceeds the 200,000 triangle-frame export budget. Shorten the timeline or use fewer 3D layers.');
  // Each animated clip adds four geometry tracks plus a three-number rotation
  // track. Budget their values and repeated keyTimes before allocating samples.
  const movingMasks=p.nodes.filter(n=>n.keyframes.length&&maskReference(n)).length;
  const estimatedBytes = staticBytes + (moving+movingMasks) * (p.duration + 1) * 256 + triangleFrames*320;
  if (estimatedBytes > 16_000_000) throw new Error('SVG animation exceeds the 16 MB output budget. Reduce timeline or scene complexity.');
  // Camera poses are sampled only after all allocation budgets pass, once per
  // frame for the whole scene. Every mesh consumes the same plain pose object.
  const cameras=cameraMoves&&hasMeshes?Array.from({length:p.duration},(_,frame)=>evaluateCamera(p.camera,frame)):[evaluateCamera(p.camera,0)];
  const frames = Array.from({ length: p.duration + 1 }, (_, i) => i);
  const times = frames.map(i => (i / p.duration).toFixed(8)).join(';');
  const animate = (values, attribute, type) => {
    if (values.every(v => v === values[0])) return '';
    return `<${type ? 'animateTransform' : 'animate'} attributeName="${attribute}"${type ? ` type="${type}"` : ''} values="${esc(values.join(';'))}" keyTimes="${times}" dur="${p.duration / p.fps}s" calcMode="discrete" repeatCount="indefinite"/>`;
  };
  let effects='';
  const faces=(n,frame=0)=>meshPaths(n,cameras.length===1?cameras[0]:cameras[frame]).map(face=>`<path${attrs({d:face.d,fill:face.fill,'fill-opacity':face.fillOpacity,stroke:face.stroke,'stroke-width':face.strokeWidth,'stroke-linejoin':'round'})}/>`).join('');
  const geometryFrame=(n,index)=>{
    const start=index/p.duration,end=(index+1)/p.duration;
    const values=index===0?'inline;none;none':index===p.duration-1?'none;inline;inline':'none;inline;none;none';
    const keyTimes=index===0?`0;${end};1`:index===p.duration-1?`0;${start};1`:`0;${start};${end};1`;
    return `<g data-mesh-frame="${index}" display="${index===0?'inline':'none'}"><animate attributeName="display" values="${values}" keyTimes="${keyTimes}" dur="${p.duration/p.fps}s" calcMode="discrete" repeatCount="indefinite"/>${faces(n,index)}</g>`;
  };
  const nodeSVG = (node) => {
    if (!node.visible) return '';
    const samples = node.keyframes.length ? frames.map(f => evaluateNode(node, Math.min(p.duration - 1, f))) : [node];
    const initial = samples[0];
    let body;
    if(node.type==='mesh')body=geometryMoves(node)&&p.duration>1?Array.from({length:p.duration},(_,index)=>geometryFrame(samples.length===1?initial:samples[index],index)).join(''):faces(initial);
    else{
      const tag = node.type === 'ellipse' ? 'ellipse' : node.type === 'text' ? 'text' : node.type === 'path' ? 'path' : 'rect';
      const shapeAttrs = nodeAttributes(initial);
      const shapeAnimations = Object.keys(shapeAttrs).filter(key=>key!=='transform').map(key => animate(samples.map(n => String(nodeAttributes(n)[key])), key)).join('') + (node.type==='path'?animate(samples.map(n=>`${num(n.width/(n.pathWidth||n.width))} ${num(n.height/(n.pathHeight||n.height))}`),'transform','scale'):'');
      body = `<${tag}${attrs(shapeAttrs)}>${node.type === 'text' ? textMarkup(node.text) : ''}${shapeAnimations}</${tag}>`;
    }
    const filter=effectFilter(node,'rash-export');
    if(filter){
      effects+=effectMarkup(node,'rash-export',p.camera)
        .replace(/<feGaussianBlur([^>]*)\/>/,(_,attributes)=>`<feGaussianBlur${attributes.replace(/stdDeviation="[^"]*"/,`stdDeviation="${num(initial.blur)}"`)}>${animate(samples.map(n=>String(num(n.blur))),'stdDeviation')}</feGaussianBlur>`)
        .replace(/<feDropShadow([^>]*)\/>/,(_,attributes)=>`<feDropShadow${attributes.replace(/stdDeviation="[^"]*"/,`stdDeviation="${num(initial.glow)}"`).replace(/flood-opacity="[^"]*"/,`flood-opacity="${initial.glow>0?1:0}"`)}>${animate(samples.map(n=>String(num(n.glow))),'stdDeviation')}${animate(samples.map(n=>n.glow>0?'1':'0'),'flood-opacity')}</feDropShadow>`);
      body=`<g filter="${filter}">${body}</g>`;
    }
    const clip=maskReference(node,'rash-export');
    if(clip){
      const maskShape=node.maskType==='ellipse'?'ellipse':'rect';
      const geometries=samples.map(maskAttributes),initialGeometry=geometries[0];
      const animations=Object.keys(initialGeometry).map(attribute=>attribute==='transform'
        ?animate(geometries.map(geometry=>geometry.transform.slice(7,-1)),'transform','rotate')
        :animate(geometries.map(geometry=>String(geometry[attribute])),attribute)).join('');
      effects+=`<clipPath${attrs({id:maskId(node.id,'rash-export'),clipPathUnits:'userSpaceOnUse'})}><${maskShape}${attrs(initialGeometry)}>${animations}</${maskShape}></clipPath>`;
      // This wrapper sits outside the effect group, so the finished effect is
      // clipped in layer coordinates, before the layer transform is applied.
      body=`<g clip-path="${esc(clip)}">${body}</g>`;
    }
    const wraps = [
      ['translate', n => `${num(n.x)} ${num(n.y)}`],
      ['rotate', n => `${num(n.rotation)} ${num(n.width / 2)} ${num(n.height / 2)}`],
      ['translate', n => `${num(n.width / 2)} ${num(n.height / 2)}`],
      ['scale', n => `${num(n.scale ?? 1)}`],
      ['translate', n => `${num(-n.width / 2)} ${num(-n.height / 2)}`]
    ];
    for (const [type, value] of wraps.reverse()) body = `<g transform="${type}(${value(initial)})">${animate(samples.map(value), 'transform', type)}${body}</g>`;
    const displayAnimation=animate(samples.map(n=>n.visible?'inline':'none'),'display'),displayAttribute=displayAnimation||!initial.visible?` display="${initial.visible?'inline':'none'}"`:'';
    return `<g data-node-id="${esc(node.id)}" opacity="${initial.opacity}"${displayAttribute} style="${groupStyle(node)}">${displayAnimation}${animate(samples.map(n => String(num(n.opacity))), 'opacity')}${body}</g>`;
  };
  const content=p.nodes.map(nodeSVG).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title>${effects?`<defs>${effects}</defs>`:''}<rect width="100%" height="100%" fill="${esc(p.background)}"/>${content}</svg>`;
  if(new TextEncoder().encode(svg).byteLength>outputLimit)throw new Error('SVG animation exceeds the 16 MB output budget. Reduce timeline or scene complexity.');
  return svg;
}

/** Portable symbol timelines retain their hierarchy. Only property tracks and
 * changing mesh projections are sampled; a symbol never duplicates whole scenes. */
function animatedSymbolSVG(p){
  const symbols=new Map(p.symbols.map(s=>[s.id,s])),entries=[];
  const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
  let exportDuration=p.duration,hasMovieClips=false;
  const periods=(scene,seen=new Set())=>{for(const node of scene.nodes)if(node.visible&&node.type==='symbol'){const definition=symbols.get(node.symbolId);if(node.playback==='movieclip'){if(node.startFrame>0)throw new Error('Animated SVG cannot repeat a delayed MovieClip. Set its Start frame to 1 or use a parent-synchronized playback mode.');hasMovieClips=true;exportDuration=exportDuration/gcd(exportDuration,definition.duration)*definition.duration;if(exportDuration>36000)throw new Error('MovieClip common cycle exceeds the 36,000 frame SVG export limit. Shorten the scene or symbol timelines.');}if(!seen.has(definition.id)){const next=new Set(seen);next.add(definition.id);periods(definition,next);}}};
  periods(p);
  const hasCameraMotion=camera=>camera.keyframes.some(key=>CAMERA_PROPERTIES.some(property=>Number.isFinite(key[property])));
  function describe(scene,path=[],clock=frame=>frame%p.duration,clockMoves=exportDuration>1){
    return scene.nodes.filter(node=>node.visible).map(node=>{
      const fullPath=[...path,node.id],prefix=instancePrefix('rash-export',fullPath);
      const geometryMoves=node.type==='mesh'&&clockMoves&&(hasCameraMotion(scene.camera)||node.keyframes.some(key=>['width','height','rotationX','rotationY','z'].some(property=>Object.hasOwn(key,property))));
      const entry={node,scene,clock,clockMoves,path:fullPath,prefix,geometryMoves,moving:clockMoves&&node.keyframes.length>0};entries.push(entry);
      if(node.type==='symbol'){
        const definition=symbols.get(node.symbolId);entry.definition=definition;
        const childMoves=node.playback==='movieclip'?definition.duration>1:clockMoves&&node.playback!=='single'&&definition.duration>1;
        entry.children=describe(definition,fullPath,frame=>evaluateSymbolFrame(node,clock(frame),definition,frame),childMoves);
      }
      return entry;
    });
  }
  const roots=describe(p),moving=entries.filter(e=>e.moving||e.geometryMoves).length;
  const staticBytes=entries.reduce((sum,{node:n})=>sum+(n.text?.length||0)*6+(n.text?.split('\n').length||0)*40+(n.d?.length||0)+(n.type==='mesh'?MESH_TRIANGLES[n.primitive]*320:0)+(maskReference(n)?500:0)+1000,0);
  if(staticBytes>16_000_000)throw new Error('SVG scene exceeds the 16 MB output budget. Reduce scene complexity.');
  if(!moving)return sceneToSVG(p,0);
  if(moving*exportDuration>500000)throw new Error('SVG animation exceeds the 500,000 layer-frame export budget. Shorten the timeline or reduce animated layers.');
  const work=entries.reduce((sum,e)=>sum+(e.moving?(exportDuration+1)*e.node.keyframes.length*ANIMATED_PROPERTIES.length:0)+(e.geometryMoves?exportDuration*e.scene.camera.keyframes.length*CAMERA_PROPERTIES.length:0),0);
  if(work>5_000_000)throw new Error('SVG animation exceeds the evaluation budget. Reduce keyframes or shorten the timeline.');
  const triangleFrames=entries.reduce((sum,e)=>sum+(e.geometryMoves?MESH_TRIANGLES[e.node.primitive]*exportDuration:0),0);
  if(triangleFrames>200_000)throw new Error('3D SVG animation exceeds the 200,000 triangle-frame export budget. Shorten the timeline or use fewer 3D layers.');
  const movingMasks=entries.filter(e=>e.moving&&maskReference(e.node)).length;
  if(staticBytes+(moving+movingMasks)*(exportDuration+1)*256+triangleFrames*320>16_000_000)throw new Error('SVG animation exceeds the 16 MB output budget. Reduce timeline or scene complexity.');
  const frames=Array.from({length:exportDuration+1},(_,frame)=>hasMovieClips&&frame===exportDuration?0:Math.min(frame,exportDuration-1));
  // Preserve the full numeric frame ratio. Rounding to eight decimals can
  // move discrete boundaries beyond their authored frame. Browser SMIL seek
  // clocks can still truncate requested times; interior-frame probes avoid that.
  const timeAt=frame=>String(frame/exportDuration);
  const times=frames.map((_,i)=>timeAt(i)).join(';');
  const animate=(values,attribute,type)=>{
    if(values.every(value=>value===values[0]))return '';
    return `<${type?'animateTransform':'animate'} attributeName="${attribute}"${type?` type="${type}"`:''} values="${esc(values.join(';'))}" keyTimes="${times}" dur="${exportDuration/p.fps}s" calcMode="discrete" repeatCount="indefinite"/>`;
  };
  let effects='';
  function nodeSVG(entry){
    const {node,scene,clock,path,prefix,children,definition,geometryMoves}=entry;
    const samples=entry.moving?frames.map(frame=>evaluateNode(node,clock(frame))):[evaluateNode(node,clock(0))],initial=samples[0];
    const faces=(n,rootFrame)=>meshPaths(n,evaluateCamera(scene.camera,clock(rootFrame))).map(face=>`<path${attrs({d:face.d,fill:face.fill,'fill-opacity':face.fillOpacity,stroke:face.stroke,'stroke-width':face.strokeWidth,'stroke-linejoin':'round'})}/>`).join('');
    let body;
    if(node.type==='symbol'){
      const size=n=>symbolScale(n,definition);
      body=`<g data-symbol-content="${esc(node.symbolId)}" transform="scale(${size(initial)})">${animate(samples.map(size),'transform','scale')}${children.map(nodeSVG).join('')}</g>`;
    }else if(node.type==='mesh'){
      body=geometryMoves?Array.from({length:exportDuration},(_,index)=>{
        const start=timeAt(index),end=timeAt(index+1);
        const values=index===0?'inline;none;none':index===exportDuration-1?'none;inline;inline':'none;inline;none;none';
        const keyTimes=index===0?`0;${end};1`:index===exportDuration-1?`0;${start};1`:`0;${start};${end};1`;
        return `<g data-mesh-frame="${index}" display="${index===0?'inline':'none'}"><animate attributeName="display" values="${values}" keyTimes="${keyTimes}" dur="${exportDuration/p.fps}s" calcMode="discrete" repeatCount="indefinite"/>${faces(samples.length===1?initial:samples[index],index)}</g>`;
      }).join(''):faces(initial,0);
    }else{
      const tag=node.type==='ellipse'?'ellipse':node.type==='text'?'text':node.type==='path'?'path':'rect',shapeAttrs=nodeAttributes(initial);
      const shapeAnimations=Object.keys(shapeAttrs).filter(key=>key!=='transform').map(key=>animate(samples.map(n=>String(nodeAttributes(n)[key])),key)).join('')+(node.type==='path'?animate(samples.map(n=>`${num(n.width/(n.pathWidth||n.width))} ${num(n.height/(n.pathHeight||n.height))}`),'transform','scale'):'');
      body=`<${tag}${attrs(shapeAttrs)}>${node.type==='text'?textMarkup(node.text):''}${shapeAnimations}</${tag}>`;
    }
    const filter=effectFilter(node,prefix);
    if(filter){
      effects+=effectMarkup(initial,prefix,scene.camera,node)
        .replace(/<feGaussianBlur([^>]*)\/>/,(_,attributes)=>`<feGaussianBlur${attributes}>${animate(samples.map(n=>String(num(n.blur))),'stdDeviation')}</feGaussianBlur>`)
        .replace(/<feDropShadow([^>]*)\/>/,(_,attributes)=>`<feDropShadow${attributes}>${animate(samples.map(n=>String(num(n.glow))),'stdDeviation')}${animate(samples.map(n=>n.glow>0?'1':'0'),'flood-opacity')}</feDropShadow>`);
      body=`<g filter="${filter}">${body}</g>`;
    }
    const clip=maskReference(node,prefix);
    if(clip){
      const geometries=samples.map(maskAttributes),initialGeometry=geometries[0];
      const animations=Object.keys(initialGeometry).map(attribute=>attribute==='transform'?animate(geometries.map(geometry=>geometry.transform.slice(7,-1)),'transform','rotate'):animate(geometries.map(geometry=>String(geometry[attribute])),attribute)).join('');
      effects+=`<clipPath${attrs({id:maskId(node.id,prefix),clipPathUnits:'userSpaceOnUse'})}><${node.maskType==='ellipse'?'ellipse':'rect'}${attrs(initialGeometry)}>${animations}</${node.maskType==='ellipse'?'ellipse':'rect'}></clipPath>`;
      body=`<g clip-path="${esc(clip)}">${body}</g>`;
    }
    const wraps=[['translate',n=>`${num(n.x)} ${num(n.y)}`],['rotate',n=>`${num(n.rotation)} ${num(n.width/2)} ${num(n.height/2)}`],['translate',n=>`${num(n.width/2)} ${num(n.height/2)}`],['scale',n=>`${num(n.scale??1)}`],['translate',n=>`${num(-n.width/2)} ${num(-n.height/2)}`]];
    for(const [type,value]of wraps.reverse())body=`<g transform="${type}(${value(initial)})">${animate(samples.map(value),'transform',type)}${body}</g>`;
    const displayAnimation=animate(samples.map(n=>n.visible?'inline':'none'),'display'),displayAttribute=displayAnimation||!initial.visible?` display="${initial.visible?'inline':'none'}"`:'';
    return `<g data-node-id="${esc(node.id)}" data-instance-path="${esc(path.join('/'))}" opacity="${initial.opacity}"${displayAttribute} style="${groupStyle(node)}">${displayAnimation}${animate(samples.map(n=>String(num(n.opacity))),'opacity')}${body}</g>`;
  }
  const content=roots.map(nodeSVG).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title>${effects?`<defs>${effects}</defs>`:''}<rect width="100%" height="100%" fill="${esc(p.background)}"/>${content}</svg>`;
  if(new TextEncoder().encode(svg).byteLength>16_000_000)throw new Error('SVG animation exceeds the 16 MB output budget. Reduce timeline or scene complexity.');
  return svg;
}
