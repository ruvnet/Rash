/** Runs the Rust ActionScript subset inside a dedicated worker. No JS eval fallback. */
export async function createRuntime({ timeout = 2000 } = {}) {
  const workerUrl = new URL('./worker.js', import.meta.url);
  // Browsers require same-origin worker entries even for a cross-origin ES module.
  // The blob entry imports the public module using CORS and is revoked on dispose.
  const crossOrigin = workerUrl.origin !== globalThis.location.origin;
  const wrapper = crossOrigin ? URL.createObjectURL(new Blob([`import ${JSON.stringify(workerUrl.href)};`], { type: 'text/javascript' })) : null;
  let worker;
  try { worker = new Worker(wrapper || workerUrl, { type: 'module', name: 'rash-runtime' }); }
  catch (error) { if (wrapper) URL.revokeObjectURL(wrapper); throw error; }
  let nextId = 0;
  let closed = false;
  const pending = new Map();
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const initTimer = setTimeout(() => { rejectReady(new Error('Rust WASM runtime initialization timed out')); dispose(); }, 15000);

  function dispose() {
    if (closed) return;
    closed = true;
    clearTimeout(initTimer);
    worker.terminate();
    if (wrapper) URL.revokeObjectURL(wrapper);
    for (const { resolve, timer } of pending.values()) {
      clearTimeout(timer);
      resolve({ logs: [], commands: [], error: 'Runtime worker disposed', steps: 0 });
    }
    pending.clear();
  }

  worker.onmessage = ({ data }) => {
    if (data.type === 'ready') { clearTimeout(initTimer); resolveReady(); return; }
    if (data.type === 'init-error') { rejectReady(new Error(data.error)); dispose(); return; }
    const request = pending.get(data.id);
    if (request) { clearTimeout(request.timer); pending.delete(data.id); request.resolve(data.result); }
  };
  worker.onerror = (event) => {
    rejectReady(new Error(event.message || 'Runtime worker failed'));
    for (const request of pending.values()) request.resolve({ logs: [], commands: [], error: 'Runtime worker failed', steps: 0 });
    dispose();
  };

  await ready;
  return {
    kind: 'rust-wasm-worker',
    run(source, context = {}) {
      if (closed) return Promise.resolve({ logs: [], commands: [], error: 'Runtime worker is closed', steps: 0 });
      if (typeof source !== 'string') return Promise.resolve({ logs: [], commands: [], error: 'Source must be a string', steps: 0 });
      if (pending.size >= 8) return Promise.resolve({ logs: [], commands: [], error: 'Runtime queue is full', steps: 0 });
      const id = ++nextId;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ logs: [], commands: [], error: 'Runtime exceeded wall clock budget; worker terminated', steps: 0 });
          dispose();
        }, Math.max(100, Math.min(10000, timeout)));
        pending.set(id, { resolve, timer });
        try { worker.postMessage({ id, source, context }); }
        catch (error) { clearTimeout(timer); pending.delete(id); resolve({ logs: [], commands: [], error: error.message, steps: 0 }); }
      });
    },
    dispose,
  };
}
