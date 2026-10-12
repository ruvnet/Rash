import { bindWasm } from './wasm.js';

let run;
try {
  const response = await fetch(new URL('./pkg/rash_runtime.wasm', import.meta.url), { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Runtime download failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  run = bindWasm(instance);
  self.postMessage({ type: 'ready', engine: 'Rust WASM', version: '0.1.0' });
} catch (error) {
  self.postMessage({ type: 'init-error', error: `Rust WASM unavailable: ${error.message}` });
}

self.onmessage = ({ data }) => {
  let result;
  try {
    if (!run) throw new Error('Runtime not initialized');
    result = run(data.source, data.context);
  } catch (error) {
    result = { logs: [], commands: [], error: `Runtime failure: ${error.message}`, steps: 0 };
  }
  self.postMessage({ id: data.id, result });
};
