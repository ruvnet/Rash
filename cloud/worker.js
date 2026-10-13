import { createMcpHandler, UI_URI } from '../mcp/protocol.js';
import { R2Store } from './store.js';
const MAX_BODY = 5_000_000;
const HOST_ORIGINS = new Set(['https://chatgpt.com', 'https://chat.openai.com', 'https://claude.ai']);
const publicMethods = new Set(['initialize', 'ping', 'tools/list', 'resources/templates/list', 'notifications/initialized']);
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
function response(status, value, extra = {}) { return new Response(value === null ? null : JSON.stringify(value), { status, headers: { ...headers, ...extra } }); }
async function readJSON(request) {
 const length = request.headers.get('content-length');
 if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw Object.assign(new Error('Request exceeds 5 MB'), { status: 413 });
 const reader = request.body?.getReader();
 if (!reader) throw Object.assign(new Error('JSON body required'), { status: 400 });
 const chunks = []; let bytes = 0;
 try {
  for (;;) {
   const { done, value } = await reader.read();
   if (done) break;
   bytes += value.byteLength;
   if (bytes > MAX_BODY) { await reader.cancel(); throw Object.assign(new Error('Request exceeds 5 MB'), { status: 413 }); }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 const all = new Uint8Array(bytes); let offset = 0;
 for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
 try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); }
 catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
// Sites must strip client supplied identity headers and inject its verified identity.
// Do not expose this worker directly on an unprotected workers.dev route.
export function createWorker({ readUI, readPage, readStudioAsset } = {}) {
 return { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/studio' || url.pathname.startsWith('/studio/')) {
   const identity = request.headers.get('oai-authenticated-user-id');
   if (!identity || !identity.trim() || identity.length > 512) return response(401, { error: 'Authenticated Sites identity required' });
   if (request.method !== 'GET' && request.method !== 'HEAD') return response(405, { error: 'Use GET or HEAD for Studio' }, { allow: 'GET, HEAD' });
   if (url.pathname === '/studio') return new Response(null, { status: 308, headers: { ...headers, location: '/studio/' } });
   // Match canonical allowlisted paths only. Never decode or resolve user paths into a filesystem.
   if (/%|\\|(?:^|\/)\.{1,2}(?:\/|$)|\/\//.test(url.pathname)) return response(404, { error: 'Not found' });
   if (url.pathname === '/studio/legacy.html') return new Response(null, { status: 302, headers: { ...headers, location: 'https://ruvnet.github.io/Rash/legacy.html' } });
   const asset = await readStudioAsset?.(url.pathname.slice('/studio/'.length) + (url.pathname.endsWith('/') ? 'index.html' : ''));
   if (!asset) return response(404, { error: 'Not found' });
   return new Response(request.method === 'HEAD' ? null : asset.body, { headers: {
    ...headers, 'content-type': asset.type,
    'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; img-src 'self' blob: data:; media-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self' https://chatgpt.com https://chat.openai.com https://claude.ai",
    'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'same-origin'
   } });
  }
  if (url.pathname === '/' && request.method === 'GET' && readPage) {
   const identity = request.headers.get('oai-authenticated-user-id');
   if (!identity || !identity.trim() || identity.length > 512) return response(401, { error: 'Authenticated Sites identity required' });
   return new Response(await readPage(), { headers: {
    ...headers, 'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self' blob: data:; img-src 'self' blob: data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://chatgpt.com https://chat.openai.com https://claude.ai",
    'referrer-policy': 'no-referrer'
   } });
  }
  if (url.pathname !== '/mcp') return response(404, { error: 'Not found' });
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin && !HOST_ORIGINS.has(origin)) return response(403, { error: 'Origin not allowed' });
  if (request.method !== 'POST') return response(405, { error: 'Use POST for stateless MCP' }, { allow: 'POST' });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return response(415, { error: 'Content-Type must be application/json' });
  let message;
  try { message = await readJSON(request); }
  catch (error) { return response(error.status || 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } }); }
  const publicRequest = publicMethods.has(message?.method) || message?.method === 'resources/read' && message?.params?.uri === UI_URI;
  const identity = request.headers.get('oai-authenticated-user-id');
  if (!publicRequest && (!identity || !identity.trim() || identity.length > 512)) return response(401, { error: 'Authenticated Sites identity required' });
  try {
   const store = identity ? await R2Store.create(env.RASH_PROJECTS, identity) : null;
   const result = await createMcpHandler({ store, readUI, stateless: true })(message);
   return response(result === null ? 202 : 200, result);
  } catch { return response(500, { error: 'MCP service unavailable' }); }
 } };
}
export default createWorker();
