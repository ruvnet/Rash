import { validateProject, serializeProject } from '../core/model.js';
import { sceneToSVG } from '../core/renderer.js';
import { animatedSVG } from './svg.js';
import { GIFEncoder } from './gif.js';
import { createImagePDF } from './pdf.js';
export { animatedSVG } from './svg.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeJSON = p => JSON.stringify(p).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const nextPaint = () => new Promise(resolve => setTimeout(resolve, 0));
const nameOf = p => (p.name.normalize('NFKD').replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'rash-project');
export function embedCode(input, { baseURL = new URL('../', import.meta.url).href } = {}) {
  const p = validateProject(input);
  const url = new URL('embed.js', baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Embed base URL must be an HTTP or HTTPS URL without credentials.');
  return `<script type="module" src="${esc(url.href)}"></script>\n<rash-player controls autoplay loop style="display:block;width:100%;max-width:${p.width}px;aspect-ratio:${p.width}/${p.height}">\n  <script type="application/json">${safeJSON(p)}</script>\n</rash-player>`;
}
async function rasterize(project, frame, canvas, ctx) {
  const svg = sceneToSVG(project, frame);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The SVG frame could not be rasterized.')); image.src = url; });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = project.background === 'transparent' || project.background === 'none' ? '#ffffff' : project.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally { URL.revokeObjectURL(url); }
}
function canvasFor(p, maxEdge = 4096) {
  if (typeof document === 'undefined') throw new Error('This export requires a browser.');
  const ratio = Math.min(1, maxEdge / Math.max(p.width, p.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(p.width * ratio)); canvas.height = Math.max(1, Math.round(p.height * ratio));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  return { canvas, ctx };
}
const canvasBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(`Could not encode ${type}.`)), type, quality));
export function mp4Support() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && ['video/mp4;codecs=avc1.42E01E', 'video/mp4'].some(type => MediaRecorder.isTypeSupported(type));
}
async function exportMP4(p, progress) {
  if (!mp4Support()) throw new Error('MP4 recording is unavailable in this browser. Use Safari or a browser with MediaRecorder MP4 support, or export animated SVG/GIF. A WebM file will never be labeled MP4.');
  if (p.duration / p.fps > 60) throw new Error('MP4 export is limited to 60 seconds per clip. Shorten the timeline.');
  const { canvas, ctx } = canvasFor(p, 1920);
  // Encoder formats often require even dimensions.
  canvas.width = Math.ceil(canvas.width / 2) * 2; canvas.height = Math.ceil(canvas.height / 2) * 2;
  await rasterize(p, 0, canvas, ctx);
  const mimeType = ['video/mp4;codecs=avc1.42E01E', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  const stream = canvas.captureStream(p.fps), chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
  const completed = new Promise((resolve, reject) => {
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = e => reject(new Error(e.error?.message || 'MP4 recording failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
  });
  completed.catch(() => {});
  // Recording is real-time; sample the timeline using elapsed time to prevent slow drawing from stretching duration.
  const total = p.duration / p.fps * 1000, started = performance.now();
  try {
    recorder.start();
    do {
      const elapsed = performance.now() - started;
      const frame = Math.min(p.duration - 1, Math.floor(elapsed / 1000 * p.fps));
      await rasterize(p, frame, canvas, ctx);
      progress(Math.min(0.99, elapsed / total));
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 / Math.min(p.fps, 60) - 2)));
    } while (performance.now() - started < total);
    recorder.stop();
    const blob = await completed;
    const header = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    if (!new TextDecoder().decode(header).includes('ftyp')) throw new Error('Browser returned an invalid MP4 container. Try another supported browser.');
    return blob;
  } finally { if (recorder.state !== 'inactive') recorder.stop(); stream.getTracks().forEach(track => track.stop()); }
}
export async function exportProject(input, format, { onProgress = () => {} } = {}) {
  const p = validateProject(input), kind = String(format).toLowerCase();
  const progress = n => onProgress(Math.max(0, Math.min(1, n)));
  progress(0);
  let blob, extension = kind;
  if (kind === 'json' || kind === 'rash') { blob = new Blob([serializeProject(p)], { type: 'application/json' }); extension = kind === 'rash' ? 'rash.json' : 'json'; }
  else if (kind === 'svg') blob = new Blob([animatedSVG(p)], { type: 'image/svg+xml;charset=utf-8' });
  else if (kind === 'html') {
    const svg = animatedSVG(p);
    blob = new Blob([`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)}</title><style>html,body{margin:0;min-height:100%;background:${p.background};}svg{display:block;width:100%;height:auto;max-height:100vh} @media(prefers-reduced-motion:reduce){svg{visibility:visible}}</style><main>${svg}</main><script>if(matchMedia('(prefers-reduced-motion: reduce)').matches)document.querySelector('svg').pauseAnimations();</script></html>`], { type: 'text/html;charset=utf-8' });
  } else if (kind === 'gif') {
    if (p.duration / p.fps > 60) throw new Error('GIF export is limited to 60 seconds per clip. Shorten the timeline.');
    const { canvas, ctx } = canvasFor(p, 640), encoder = new GIFEncoder(canvas.width, canvas.height);
    const count = Math.max(1, Math.min(120, Math.ceil(p.duration / p.fps * 12))), delay = p.duration / p.fps * 100 / count;
    for (let i = 0; i < count; i++) {
      await rasterize(p, Math.min(p.duration - 1, Math.floor(i / count * p.duration)), canvas, ctx);
      encoder.addFrame(ctx.getImageData(0, 0, canvas.width, canvas.height).data, Math.round((i + 1) * delay) - Math.round(i * delay));
      progress((i + 1) / count); await nextPaint();
    }
    blob = encoder.finish();
  } else if (kind === 'pdf' || kind === 'png') {
    const { canvas, ctx } = canvasFor(p);
    await rasterize(p, 0, canvas, ctx);
    if (kind === 'png') blob = await canvasBlob(canvas, 'image/png');
    else { const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.96); blob = createImagePDF(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height); }
  } else if (kind === 'mp4') blob = await exportMP4(p, progress);
  else throw new Error(`Unknown export format: ${kind}`);
  progress(1);
  return { blob, filename: `${nameOf(p)}.${extension}` };
}
