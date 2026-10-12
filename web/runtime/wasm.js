/** Minimal raw WASM ABI adapter, shared by the browser worker and Node verification. */
export function bindWasm(instance) {
  const { memory, rash_alloc, rash_dealloc, rash_run, rash_result_len } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || !rash_run) throw new Error('Invalid Rash runtime module');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return (source, context = {}) => {
    const input = encoder.encode(JSON.stringify({ source, context }));
    if (input.byteLength > 2_097_152) return { logs: [], commands: [], error: 'Request exceeds 2 MiB limit', steps: 0 };
    const ptr = rash_alloc(input.byteLength);
    if (!ptr) throw new Error('Unable to allocate runtime input');
    let resultPtr = 0;
    let resultLen = 0;
    try {
      new Uint8Array(memory.buffer, ptr, input.byteLength).set(input);
      resultPtr = rash_run(ptr, input.byteLength);
      resultLen = rash_result_len();
      return JSON.parse(decoder.decode(new Uint8Array(memory.buffer, resultPtr, resultLen)));
    } finally {
      rash_dealloc(ptr, input.byteLength);
      if (resultPtr) rash_dealloc(resultPtr, resultLen);
    }
  };
}
