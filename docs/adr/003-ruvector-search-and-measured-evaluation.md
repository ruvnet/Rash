# ADR 003: Optional RuVector search and measured evaluation

Status: Accepted and exercised with the published binaries.

## Decision

Vendor the browser glue and actual WASM from `@ruvector/wasm@0.2.1`, with its license and artifact hashes. Load it from the same origin on first template search. Use a 256-dimensional normalized hashed-token vector and exact cosine search. These are lexical features, not learned semantic embeddings. The small template catalog does not need approximate HNSW search.

Cache a single index keyed by catalog metadata. Free its WASM allocations when replacing it. Convert RuVector's raw distance to a bounded similarity score with larger values indicating a closer match. If WASM initialization or result validation fails, execute deterministic JavaScript cosine search and report the fallback backend. Never silently label fallback output as RuVector.

Limit queries to 512 characters, catalogs to 2,000 entries, tags to 32 per entry and metadata lengths. Empty queries return catalog order without loading WASM.

Use `scripts/metaharness-evaluate.mjs` to execute parity tests and measure both paths. The optional `--with-cli` flag runs pinned `metaharness@0.4.17 score` with package install scripts and optional dependencies disabled. MetaHarness output is a static repository heuristic. It is not an audit certificate, a test run, a trained model, a proven cost estimate or self improvement.

## Observed evidence

An initial local Node 24 run with six real templates measured 8.45 ms cold initialization, 0.110 ms warm median and 0.369 ms p95 for the WASM path. The JavaScript path measured 0.116 ms median and 0.620 ms p95 across 50 queries. These measurements include feature generation, are hardware specific, and are too small to justify a general speedup claim. The WASM file is 303,577 bytes uncompressed. The complete evidence command reruns the measurement rather than treating these numbers as permanent guarantees.

## Acceptance

Run `node scripts/metaharness-evaluate.mjs --with-cli`. Require execution of the actual WASM module, correct ranking parity, finite scores, all local resource rejection tests passing, and successful CLI completion when requested. Reproduce browser measurements separately before asserting browser latency or mobile performance.

## Sources

* [RuVector source](https://github.com/ruvnet/RuVector)
* [Exact npm package metadata](https://registry.npmjs.org/@ruvector/wasm/0.2.1)
* [MetaHarness source](https://github.com/ruvnet/agent-harness-generator)
* [Exact MetaHarness package metadata](https://registry.npmjs.org/metaharness/0.4.17)
