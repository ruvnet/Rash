# Vendored Ruffle 0.7.1

Exact npm package: `@ruffle-rs/ruffle@0.7.1`, fetched 2026-10-12.
Source: https://github.com/ruffle-rs/ruffle
Distribution: https://registry.npmjs.org/@ruffle-rs/ruffle/-/ruffle-0.7.1.tgz

The unmodified JavaScript and WebAssembly distribution is licensed MIT OR Apache-2.0; both upstream license files are included. Source maps are omitted. `provenance.json` records upstream integrity and individual SHA-256 hashes.

The legacy page loads this engine only on request. It is not imported by the SVG editor or normal embedded player. Upstream's ActionScript support is incomplete: https://ruffle.rs/compatibility

Rash config disables script access, external links, and networking. Because upstream currently documents `allowNetworking: none` as not implemented, Rash additionally uses an opaque iframe sandbox, `connect-src 'none'`, a fixed WASM asset broker, and a non-overridable fetch guard. See `docs/runtime.md`.
