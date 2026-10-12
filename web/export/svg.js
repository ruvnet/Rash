import { validateProject, evaluateNode, evaluateCamera, ANIMATED_PROPERTIES, CAMERA_PROPERTIES, MESH_TRIANGLES } from '../core/model.js';
import { sceneToSVG, nodeAttributes, textMarkup, effectMarkup, effectFilter, groupStyle, maskId, maskReference, maskAttributes } from '../core/renderer.js';
import { meshPaths } from '../core/three-svg.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const num = n => Math.round(n * 1000) / 1000;
const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
export function animatedSVG(input) {
  const p = validateProject(input);
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
    return `<g data-node-id="${esc(node.id)}" opacity="${initial.opacity}" style="${groupStyle(node)}">${animate(samples.map(n => String(num(n.opacity))), 'opacity')}${body}</g>`;
  };
  const content=p.nodes.map(nodeSVG).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title>${effects?`<defs>${effects}</defs>`:''}<rect width="100%" height="100%" fill="${esc(p.background)}"/>${content}</svg>`;
  if(new TextEncoder().encode(svg).byteLength>outputLimit)throw new Error('SVG animation exceeds the 16 MB output budget. Reduce timeline or scene complexity.');
  return svg;
}
