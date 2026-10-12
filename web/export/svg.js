import { validateProject, evaluateNode } from '../core/model.js';
import { sceneToSVG, nodeAttributes, textMarkup } from '../core/renderer.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const num = n => Math.round(n * 1000) / 1000;
const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
export function animatedSVG(input) {
  const p = validateProject(input);
  const staticBytes = p.nodes.reduce((sum, n) => sum + (n.text?.length || 0) * 6 + (n.text?.split('\n').length || 0) * 40 + (n.d?.length || 0) + 1000, 0);
  if (staticBytes > 16_000_000) throw new Error('SVG scene exceeds the 16 MB output budget. Reduce scene complexity.');
  if (!p.nodes.some(n => n.keyframes.length)) return sceneToSVG(p, 0);
  const moving = p.nodes.filter(n => n.keyframes.length).length;
  if (moving * p.duration > 500000) throw new Error('SVG animation exceeds the 500,000 layer-frame export budget. Shorten the timeline or reduce animated layers.');
  const work = p.nodes.reduce((sum, n) => sum + (n.keyframes.length ? (p.duration + 1) * n.keyframes.length * 7 : 0), 0);
  if (work > 5_000_000) throw new Error('SVG animation exceeds the evaluation budget. Reduce keyframes or shorten the timeline.');
  const estimatedBytes = staticBytes + moving * (p.duration + 1) * 256;
  if (estimatedBytes > 16_000_000) throw new Error('SVG animation exceeds the 16 MB output budget. Reduce timeline or scene complexity.');
  const frames = Array.from({ length: p.duration + 1 }, (_, i) => i);
  const times = frames.map(i => (i / p.duration).toFixed(8)).join(';');
  const animate = (values, attribute, type) => {
    if (values.every(v => v === values[0])) return '';
    return `<${type ? 'animateTransform' : 'animate'} attributeName="${attribute}"${type ? ` type="${type}"` : ''} values="${esc(values.join(';'))}" keyTimes="${times}" dur="${p.duration / p.fps}s" calcMode="discrete" repeatCount="indefinite"/>`;
  };
  const nodeSVG = (node, index) => {
    if (!node.visible) return '';
    const samples = node.keyframes.length ? frames.map(f => evaluateNode(node, Math.min(p.duration - 1, f))) : [node];
    const initial = samples[0];
    const tag = node.type === 'ellipse' ? 'ellipse' : node.type === 'text' ? 'text' : node.type === 'path' ? 'path' : 'rect';
    const shapeAttrs = nodeAttributes(initial);
    const shapeAnimations = Object.keys(shapeAttrs).filter(key=>key!=='transform').map(key => animate(samples.map(n => String(nodeAttributes(n)[key])), key)).join('') + (node.type==='path'?animate(samples.map(n=>`${num(n.width/(n.pathWidth||n.width))} ${num(n.height/(n.pathHeight||n.height))}`),'transform','scale'):'');
    let body = `<${tag}${attrs(shapeAttrs)}>${node.type === 'text' ? textMarkup(node.text) : ''}${shapeAnimations}</${tag}>`;
    const wraps = [
      ['translate', n => `${num(n.x)} ${num(n.y)}`],
      ['rotate', n => `${num(n.rotation)} ${num(n.width / 2)} ${num(n.height / 2)}`],
      ['translate', n => `${num(n.width / 2)} ${num(n.height / 2)}`],
      ['scale', n => `${num(n.scale ?? 1)}`],
      ['translate', n => `${num(-n.width / 2)} ${num(-n.height / 2)}`]
    ];
    for (const [type, value] of wraps.reverse()) body = `<g transform="${type}(${value(initial)})">${animate(samples.map(value), 'transform', type)}${body}</g>`;
    return `<g data-node-id="${esc(node.id)}" opacity="${initial.opacity}">${animate(samples.map(n => String(num(n.opacity))), 'opacity')}${body}</g>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title><rect width="100%" height="100%" fill="${esc(p.background)}"/>${p.nodes.map(nodeSVG).join('')}</svg>`;
}
