const frame = document.querySelector('#legacy-player');
const status = document.querySelector('#status');
const picker = document.querySelector('#swf-file');
const closeButton = document.querySelector('#stop-player');
const MAX_FILE = 20 * 1024 * 1024;
const assets = new Map([
  ['172de42e6619eac8f371.wasm', new URL('./vendor/ruffle/172de42e6619eac8f371.wasm', import.meta.url).href],
  ['878d548199cddef07035.wasm', new URL('./vendor/ruffle/878d548199cddef07035.wasm', import.meta.url).href],
]);
const assetCache = new Map();
let pendingMovie = null;
let generation = 0;
let loadTimer;
const allowedScripts = ['./runtime/legacy.js', './vendor/ruffle/ruffle.js', './vendor/ruffle/core.ruffle.16d61072ac7fdc4d5013.js', './vendor/ruffle/core.ruffle.994eeef0a471a88cd0e3.js'].map(path => new URL(path, import.meta.url).href);

function createFrame() {
  const csp = `default-src 'none'; script-src 'wasm-unsafe-eval' ${allowedScripts.join(' ')}; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body,#stage{margin:0;width:100%;height:100%;overflow:hidden;background:#0b0f0d;color:#b3c5ba;font:14px system-ui}#stage{display:grid;place-items:center}ruffle-player{width:100%;height:100%}p{padding:24px;text-align:center}</style></head><body><div id="stage"><p>Preparing isolated player…</p></div><script src="${allowedScripts[0]}" data-session="${generation}"></script></body></html>`;
}

function reset() {
  generation++;
  clearTimeout(loadTimer);
  pendingMovie = null;
  frame.srcdoc = '<!doctype html><html><body style="margin:0;background:#0b0f0d;color:#a9b8ad;font:15px system-ui;display:grid;place-items:center;height:100vh"><p>No movie loaded.</p></body></html>';
  closeButton.disabled = true;
}

async function loadMovie(data, name) {
  if (data.byteLength < 8 || data.byteLength > MAX_FILE) throw new Error('SWF must be between 8 bytes and 20 MiB.');
  const sig = String.fromCharCode(...new Uint8Array(data, 0, 3));
  if (!['FWS', 'CWS', 'ZWS'].includes(sig)) throw new Error('This is not a SWF file (expected FWS, CWS, or ZWS header).');
  const expanded = new DataView(data).getUint32(4, true);
  if (expanded < 8 || expanded > MAX_FILE) throw new Error('Declared uncompressed SWF size exceeds the 20 MiB limit or is invalid.');
  reset();
  pendingMovie = { data, name: String(name).slice(0, 200) };
  status.textContent = `Loading ${name}. The legacy WebAssembly engine downloads on first use…`;
  closeButton.disabled = false;
  createFrame();
  loadTimer = setTimeout(() => { status.textContent = 'The movie took too long to initialize. Close it and try another file.'; }, 30000);
}

window.addEventListener('message', async (event) => {
  if (event.source !== frame.contentWindow || event.origin !== 'null') return;
  const message = event.data;
  if (!message || typeof message !== 'object' || message.session !== generation) return;
  if (message.type === 'ready' && pendingMovie) {
    const movie = pendingMovie;
    pendingMovie = null;
    frame.contentWindow.postMessage({ type: 'load', session: generation, ...movie }, '*', [movie.data]);
  } else if (message.type === 'asset-request' && assets.has(message.name) && Number.isSafeInteger(message.id)) {
    const ticket = generation;
    try {
      if (!assetCache.has(message.name)) {
        assetCache.set(message.name, fetch(assets.get(message.name), { credentials: 'omit' }).then(response => {
          if (!response.ok) throw new Error(`Runtime download failed (${response.status})`);
          return response.arrayBuffer();
        }));
      }
      const cached = await assetCache.get(message.name);
      if (ticket !== generation) return;
      const data = cached.slice(0);
      frame.contentWindow.postMessage({ type: 'asset-result', session: generation, id: message.id, data }, '*', [data]);
    } catch (error) {
      assetCache.delete(message.name);
      if (ticket === generation) frame.contentWindow.postMessage({ type: 'asset-result', session: generation, id: message.id, error: error.message }, '*');
    }
  } else if (message.type === 'loaded') {
    clearTimeout(loadTimer);
    status.textContent = `Playing ${String(message.name).slice(0, 200)} in isolated Ruffle. Networking and script access are disabled.`;
  } else if (message.type === 'error') {
    clearTimeout(loadTimer);
    status.textContent = `Player error: ${String(message.error).slice(0, 500)}`;
  }
});

picker.addEventListener('change', async () => {
  const file = picker.files?.[0];
  if (!file) return;
  try { if (file.size > MAX_FILE) throw new Error('File exceeds the 20 MiB limit.'); await loadMovie(await file.arrayBuffer(), file.name); }
  catch (error) { status.textContent = error.message; }
  picker.value = '';
});
closeButton.addEventListener('click', () => { reset(); status.textContent = 'Movie closed. Its isolated player has been disposed.'; });
// A tiny original one-frame SWF, generated locally from the public SWF structure.
// It paints a solid orange stage. No ActionScript, assets, network, or third-party content.
document.querySelector('#load-demo').addEventListener('click', async () => {
  try {
    const response = await fetch(new URL('./runtime/sample.swf', import.meta.url));
    if (!response.ok) throw new Error('Built-in test movie unavailable.');
    await loadMovie(await response.arrayBuffer(), 'Rash original SWF smoke test');
  } catch (error) { status.textContent = error.message; }
});
reset();
