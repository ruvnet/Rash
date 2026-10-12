/** Local lexical vector search. Hashed tokens are not learned semantic embeddings. */
export const SEARCH_DIMENSIONS = 256;
export const RUVECTOR_PACKAGE = '@ruvector/wasm@0.2.1';
const MAX_TEMPLATES = 2000;
let wasmModule;
let indexCache;

function tokens(text) {
  return String(text ?? '').slice(0, 4096).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function lexicalVector(text) {
  const vector = new Float32Array(SEARCH_DIMENSIONS);
  for (const token of tokens(text)) {
    let hash = 2166136261;
    for (const c of token) hash = Math.imul(hash ^ c.codePointAt(0), 16777619) >>> 0;
    vector[hash % SEARCH_DIMENSIONS] += 1;
  }
  const norm = Math.hypot(...vector);
  if (norm) for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

function prepare(templates) {
  if (!Array.isArray(templates) || templates.length > MAX_TEMPLATES) throw new RangeError(`Expected up to ${MAX_TEMPLATES} templates`);
  const ids = new Set();
  return templates.map(t => {
    if (!t || typeof t.id !== 'string' || !t.id || t.id.length > 128 || ids.has(t.id)) throw new TypeError('Template IDs must be unique nonempty strings');
    ids.add(t.id);
    const name = String(t.name ?? '').slice(0, 256);
    const tags = Array.isArray(t.tags) ? t.tags.slice(0, 32).map(x => String(x).slice(0, 128)).join(' ') : '';
    const text = `${name} ${name} ${tags} ${tags} ${String(t.description ?? '').slice(0, 2048)}`;
    return { id: t.id, text, vector: lexicalVector(text) };
  });
}

async function loadWasm(bytes) {
  if (!wasmModule) wasmModule = (async () => {
    const mod = await import('../vendor/ruvector/ruvector_wasm.js');
    await mod.default(bytes ? { module_or_path: bytes } : undefined);
    return mod;
  })();
  return wasmModule;
}

/** options.backend='javascript' enables offline parity checks; wasmBytes is for Node tests. */
export async function searchTemplates(query, templates, options = {}) {
  if (typeof query !== 'string' || query.length > 512) throw new RangeError('Search query must contain at most 512 characters');
  const started = performance.now();
  const rows = prepare(templates);
  if (!query.trim()) return { results: rows.map(r => ({ id: r.id, score: 1 })), backend: 'catalog', elapsedMs: performance.now() - started };
  const vector = lexicalVector(query);
  if (!vector.some(Boolean)) return { results: [], backend: 'catalog', elapsedMs: performance.now() - started };
  let backend = 'javascript-cosine';
  let results;
  let fallbackReason;
  if (options.backend !== 'javascript' && rows.length) {
    try {
      const mod = await loadWasm(options.wasmBytes);
      const key = JSON.stringify(rows.map(r => [r.id, r.text]));
      if (!indexCache || indexCache.key !== key) {
        indexCache?.db.free();
        indexCache = null;
        // Exact flat search is preferable to HNSW for a small template catalog.
        const db = new mod.VectorDB(SEARCH_DIMENSIONS, 'cosine', false);
        try { for (const row of rows) db.insert(row.vector, row.id); }
        catch (error) { db.free(); throw error; }
        indexCache = { key, db };
      }
      const matches = indexCache.db.search(vector, rows.length);
      // RuVector scores are distances. Expose bounded similarity, higher is better.
      results = matches.map(hit => {
        try { return { id: hit.id, score: Math.max(0, Math.min(1, 1 - hit.score)) }; }
        finally { hit.free?.(); }
      });
      if (results.length !== rows.length || results.some(r => !Number.isFinite(r.score))) throw new Error('Incomplete or invalid vector results');
      backend = 'ruvector-wasm';
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : 'WASM unavailable';
    }
  }
  if (backend !== 'ruvector-wasm') results = rows.map(row => ({ id: row.id, score: Math.max(0, Math.min(1, row.vector.reduce((sum, value, i) => sum + value * vector[i], 0))) }));
  results = results.filter(r => r.score > 0.000001).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { results, backend, elapsedMs: performance.now() - started, ...(fallbackReason ? { fallbackReason } : {}) };
}

export function disposeSearch() { indexCache?.db.free(); indexCache = null; }
