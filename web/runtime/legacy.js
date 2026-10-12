/* Classic script intentionally runs in an opaque sandbox, with connect-src 'none'. */
(() => {
  const selfUrl = new URL(document.currentScript.src);
  const session = Number(document.currentScript.dataset.session);
  const vendor = new URL('../vendor/ruffle/', selfUrl).href;
  const wasmNames = new Set(['172de42e6619eac8f371.wasm', '878d548199cddef07035.wasm']);
  const requests = new Map();
  let serial = 0;
  let player;
  const report = (type, fields = {}) => parent.postMessage({ type, session, ...fields }, '*');

  // Ruffle's NetworkingAccessMode.None is documented as incomplete. No Flash
  // network request reaches native fetch: only exact pinned WASM assets are brokered.
  const guardedFetch = (resource, options = {}) => {
    let url;
    try { url = new URL(typeof resource === 'string' || resource instanceof URL ? resource : resource.url, selfUrl); }
    catch { return Promise.reject(new Error('Network access is disabled')); }
    const name = url.pathname.split('/').pop();
    const method = options.method || resource?.method || 'GET';
    if (method !== 'GET' || url.href !== vendor + name || !wasmNames.has(name)) return Promise.reject(new Error('Network access is disabled in the legacy sandbox'));
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { requests.delete(id); reject(new Error('Runtime asset broker timed out')); }, 25000);
      requests.set(id, { resolve, reject, timer });
      report('asset-request', { id, name });
    });
  };
  Object.defineProperty(globalThis, 'fetch', { value: guardedFetch, writable: false, configurable: false });

  const safety = Object.freeze({
    publicPath: vendor,
    polyfills: false,
    allowScriptAccess: false,
    allowNetworking: 'none',
    openUrlMode: 'deny',
    allowFullscreen: false,
    credentialAllowList: [],
    socketProxy: [],
    fontSources: [],
    showSwfDownload: false,
    contextMenu: 'off',
    maxExecutionDuration: 1,
    autoplay: 'on',
    splashScreen: false,
    logLevel: 'error',
  });
  window.RufflePlayer = { config: { ...safety } };
  const script = document.createElement('script');
  script.src = vendor + 'ruffle.js';
  const ready = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error('Unable to load vendored Ruffle'));
  });
  document.head.append(script);

  window.addEventListener('message', async (event) => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return;
    const message = event.data;
    if (message.session !== session) return;
    if (message.type === 'asset-result') {
      const request = requests.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      requests.delete(message.id);
      if (message.error) request.reject(new Error(String(message.error)));
      else if (message.data instanceof ArrayBuffer && message.data.byteLength < 24 * 1024 * 1024) request.resolve(new Response(message.data, { headers: { 'Content-Type': 'application/wasm' } }));
      else request.reject(new Error('Invalid runtime asset'));
    } else if (message.type === 'load') {
      try {
        if (!(message.data instanceof ArrayBuffer) || message.data.byteLength > 20 * 1024 * 1024) throw new Error('Invalid SWF payload');
        await ready;
        player?.remove();
        player = window.RufflePlayer.newest().createPlayer();
        document.querySelector('#stage').replaceChildren(player);
        await player.ruffle().load({ ...safety, data: new Uint8Array(message.data), swfFileName: String(message.name).slice(0, 200) });
        report('loaded', { name: message.name });
      } catch (error) { report('error', { error: error.message || String(error) }); }
    }
  });
  ready.then(() => report('ready')).catch(error => report('error', { error: error.message }));
})();
