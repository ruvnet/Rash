# Security model

Rash processes user-authored project files and script source locally. Treat all imported content as untrusted data. The implementation narrows capabilities and budgets resources; it is not a claim of a completed independent security audit.

## Boundaries

| Input or component | Control | Remaining responsibility |
| --- | --- | --- |
| Project JSON | Explicit version 1 or 2 schema, bounded node counts, unique layer IDs within each scope, unique definition IDs, 5 MB import size limit | Keep schema validation at every import and embed boundary |
| SVG scene | Allowlisted node kinds and attributes, escaped serialized text, textContent for live text | Do not add arbitrary HTML, event handlers, external URLs or raw imported SVG |
| Symbol graph | 128 definitions, eight nesting levels, missing reference and cycle rejection, bounded stored and expanded resources | Validate unused definitions too; do not treat a small serialized shared library as cheap to render |
| Geometric masks | Allowlisted rect/ellipse, bounded numeric tracks, renderer scoped clip IDs | Clipping never relaxes filter bounds; no remote references, raw paths or new script commands |
| RashScript | Rust parser, explicit calls/properties, no JavaScript eval fallback | Extend features through explicit capabilities and regression tests |
| Runtime worker | Dedicated worker, bounded request queue and wall clock termination | Handle initialization and runtime failures visibly; dispose workers when leaving a player |
| Rust interpreter | 64 KiB source, 32,768 tokens, 50,000 operations, depth 96, 4,096 output items, bounded strings | WASM memory still consumes process resources; budgets do not prove absence of every DoS |
| Script effects | Commands returned only on successful execution | Revalidate resulting properties in the host application before applying them |
| rash resources | Local allowlist, conservative IDs, no query, fragment, traversal or remote scheme | Do not turn resource resolution into network fetch or shell dispatch |
| Template search | Local WASM assets, bounded metadata, one cached index, explicit fallback | Hashed features can collide and are not a security or semantic classifier |
| Export | Local rasterization, bounded video/GIF duration and expanded symbol animation budgets | Large raster exports can still consume significant memory and CPU |
| Persistence | Browser local storage plus explicit JSON backup | Anyone controlling that browser profile can inspect stored projects |
| Claude plugin | Skills only; no automatic hooks, credentials or background service | Host permission settings still govern agent actions |

## Shared definitions and editing scopes

Version 2 symbols are declarative graph references inside a project. They cannot load remote assets, execute scripts or create an independent MovieClip runtime. Imported playback modes and frame offsets are validated. Duplicate definition IDs, unresolved references and cycles are rejected before DOM creation, including in library definitions that have no visible instance. Version 1 documents cannot smuggle in a symbol library or symbol instances; a current player requires the explicit version 2 schema.

Validation summarizes graph expansion before rendering rather than constructing an unbounded expanded tree. Limits apply to stored content and expanded instances: 1,000 layers, 10,000 keyframes, 20,000 property timing overrides, 10,000 text lines, 32 meshes, 4,096 source triangles and 64 layers with blur/glow. Reusing a definition does not reset these limits. Animated instance scales conservatively expand descendant effect bounds, with 16 million scene units squared per filtered layer and 32 million total. Blur and glow on symbol containers are rejected; they remain available on supported artwork layers inside the definition. Masks do not reduce those bounds.

Clip and filter IDs include the renderer and complete instance path so reused child IDs cannot alias another instance's definitions. Layer IDs may repeat across different symbol scopes. Symbol names and text remain data and are escaped or assigned through safe DOM APIs.

The root document remains authoritative while the studio edits a definition. Transactions validate the complete candidate before commit, and failed edits restore the root document and editing context. Undo, Redo, autosave, backup, embed generation and exports retain the full project. Scoped helper views expose only needed symbol dependencies for local editing, then full root validation enforces the aggregate limits. Resource resolution returns copies of project, node or symbol data; resource controls return to the root Scene before acting. Authored scripts still receive only the root scene's existing allowlisted capabilities.

## Embed trust

Loading `embed.js` grants that library the normal privileges of JavaScript on the embedding origin. Shadow DOM is style encapsulation, not a security sandbox. The RashScript interpreter has a narrower capability model and does not receive those host privileges. Use an iframe with an appropriate sandbox policy when embedding mutually untrusted applications; validate the actual chosen policy with the runtime.

Sites with restrictive CSP need to permit the exact module, worker and WASM asset origins they choose. Cross-origin module workers may use a local blob wrapper and therefore require `worker-src blob:` as well as the relevant script and connection policies. Do not weaken an entire site's policy to `unsafe-eval` for RashScript; there is no JavaScript eval execution path for authored scripts. WASM compilation policy and browser support must be checked separately.

Static hosting must not contain API tokens or account credentials. An optional future Cloudflare service needs tenant identity, per-object authorization, upload limits, rate limits and explicit CORS rules. The current studio does not send projects to a shared persistence service.

## Supply chain

`web/vendor/ruvector/provenance.json` pins the upstream npm version, tarball integrity, local SHA-256 hashes and license. Validate hashes after changing vendored assets. The optional MetaHarness command pins version 0.4.17 and disables install scripts and optional dependencies. Its transitive dependencies follow the published package ranges; they are not locked by the version pin alone. Do not interpret its heuristic tool safety score as a security assessment.

## Verification

`tests/ecosystem.test.js` exercises malformed local URIs, prototype-related lookup attempts, bounded controls, actual WASM execution and backend parity. The Rust tests must cover rejected dynamic execution, unsupported imports and bounded infinite loops. Browser tests must include malicious project text, import validation and host embed behavior. Recheck these boundaries whenever adding new node types, asset imports, network APIs, script features or persistence.

Symbol regressions live in `tests/symbols.test.js`, `tests/symbol-render.test.js` and `tests/symbols-browser.mjs`. Check invalid references, cycles, nesting and expansion limits, transformed filter bounds, ID isolation, whole document persistence during scoped editing and cross origin player independence. These tests establish their named assertions only; they are not a complete Flash compatibility or independent security audit.

## MCP trust boundaries

The local MCP process stores validated project JSON in `RASH_MCP_STORE` or `~/.rash/projects`. It does not evaluate project scripts or accept arbitrary file paths. Seven tools use revision checks for updates, deletes and exports. Keep the store private to its operating system account. A local user with access to that directory can read its projects.

The hosted adapter requires Sites authenticated user identity for project access and hashes that identity into an R2 namespace. Conditional writes prevent lost updates. Deletions replace records with tombstones that contain no project content. Deploy this adapter only behind Sites identity enforcement, never as a public Worker that trusts caller supplied identity headers. HTTP requests and rendered outputs are bounded. The interactive resource displays SVG in image contexts, never executable SVG markup.

ChatGPT and Claude installations remain distinct trust boundaries. Installing a plugin grants its declared tools; no installation is implied by a passing browser harness. No credentials belong in exported projects or generated embed code.
