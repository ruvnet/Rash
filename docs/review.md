# Implementation review, 12 October 2026

This is a targeted source review and adversarial regression check performed during implementation. It is not a comprehensive security certification or a claim of complete Flash compatibility.

## Scope and threat model

The reviewed application is a static GitHub Pages deployment. The attacker controls an imported project, project text, scene geometry, timeline keys, RashScript source, or a project response loaded by an embed. Assets at risk are the embedding page's DOM and storage, the author's work, and browser availability. The reviewed trust boundaries are project normalization, SVG/HTML serialization, the custom element loader, the Rust WASM worker, local resource resolution, static export containers, and Claude plugin metadata.

The late-added legacy Ruffle player introduces a separate binary parser and emulator boundary. Its browser isolation and asset broker were inspected; the emulator binary itself was not audited.

## Findings and remediation

| Finding | Evidence before remediation | Change verified |
| --- | --- | --- |
| Negative animated geometry | A rectangle with a frame 30 width of -100 was accepted and evaluated to -100 | `web/core/model.js` now bounds width/height keys to 1..10000; security regression checks interpolation and final values |
| Main-thread SVG export amplification | A 1,594,065-byte project with 40 layers, 1000 keys per layer and 1000 frames passed the original layer-frame guard. Export took 3396 ms in Node and produced 695086 bytes | `web/export/svg.js` now checks estimated keyframe evaluation work and output size before sampling. A 10-layer, 1000-key, 1000-frame project was rejected in 6.94 ms. The original 40-layer case is also rejected by the aggregate project key limit |
| Oversized timeline DOM | The original schema allowed up to 1000 keys on each of 1000 layers | The project schema now rejects more than 10000 total keys; regression test verifies this boundary |
| Undo history memory multiplication | The original history retained 80 complete snapshots, potentially hundreds of megabytes for large valid files | `web/app.js` now caps combined history and redo snapshots to 20 MiB using UTF-16 string estimates, plus an 80-snapshot limit |
| Missing script stage dimensions | Editor runtime context omitted width and height although the embed included them | A browser script probe now returns `1280 720` for the default document |
| Script color mismatch | Rust accepted named fill colors but the scene schema replaced them with white | The scene allowlist now preserves the same named colors and rejects invalid hex lengths; a regression applies the actual WASM color command |
| Inaccurate export help | PDF was described as vector and HTML as a full player | UI now describes raster PDF and timeline-only HTML. Project scripting remains available through the explicit embed path |

No demonstrated arbitrary script execution, prototype pollution or host-page escape was found in the project import and RashScript paths exercised here. This statement is limited to the probes below.

## Regression evidence

`node --test tests/security.test.js` exercises 12 cases:

1. Rejecting executable SVG element kinds, arbitrary attributes and remote paint URLs.
2. Keeping prototype-related JSON properties inert.
3. Escaping hostile SVG and HTML text, including mixed delimiters and Unicode separators.
4. Removing XML/URL delimiters from the restricted path representation.
5. Normalizing non-finite fields and rejecting invalid project containers.
6. Bounding animated geometry.
7. Limiting aggregate timeline keys.
8. Rejecting active URL schemes, credentials and cross-origin HTTP project URLs.
9. Canceling streamed project responses larger than 5 MB, with credentials omitted and redirects rejected.
10. Rejecting excessive declared response size before reading the body.
11. Preventing inline JSON from closing its script container.
12. Running the actual Rust WASM module against host access attempts, infinite loops, oversized strings/source/requests, and transactional failure.

All 12 passed. `cargo test --quiet` passed 20 Rust tests at the time of this review. These counts may increase as implementation workers add coverage.

A separate local Chromium probe imported hostile title, layer-name and text fields into the full studio. The payload stayed literal SVG text, no injected image/script elements appeared, the execution marker remained unset, and no page errors were observed. The same probe executed `trace(stage.stageWidth,stage.stageHeight);` through the UI and received `1280 720`.

`node tests/runtime-browser.mjs` also passed in this review. It verified actual Rust workers on same-origin and cross-origin module paths, a rejected invalid SWF, the original built-in SWF rendering through Ruffle, and blocked network, local storage and parent DOM access from the opaque iframe. Closing the movie disposed the player. The browser test uses the valid BCP-47 locale `en-US`; the container's default `en-US@posix` causes Ruffle's Intl initialization to fail and is not a supported browser locale.

The Claude package contains manifests and passive skills. No automatically executing hooks, credentials, arbitrary tool server or background installation was present in the reviewed package.

## Dependency and tool evidence

The review used Node 24.19.0, npm 11.9.0, Rust 1.99.0, Cargo 1.99.0 and Playwright 1.56.1. `npm audit --json` and `npm audit --omit=dev --json` returned zero reported vulnerabilities for the lockfile queried on 12 October 2026. The advisory response did not include an advisory-feed timestamp. This result does not audit vendored WASM assets or Rust dependencies.

The package-lock SHA-256 at the time of those queries was `d252359f08a9c2b6f8d74a6cd632e3b1fba5b965f0f886be345ea293c0b1c63e`.

The Ruflo security skill guided scope and evidence handling. Its heuristic CLI scanner was not used for this independent review; no scanner-clean assertion is made. Runtime and RuVector tests executed actual WASM assets rather than substitutes.

## Residual limitations

RashScript is a restricted interpreter, not complete ActionScript. Unsupported SWF and ActionScript behavior must remain explicit. Ruffle compatibility is a separate upstream capability and does not turn SWF into editable native scenes.

Heavy scenes still consume CPU, memory and DOM resources within the declared limits. The current evaluator scans keyframes; it is not an indexed or GPU animation engine. Mobile performance near the limits needs device-specific measurement. Recorded MP4 is browser-dependent and can skip frames under load.

Shadow DOM encapsulates styles; loading the JavaScript embed grants that library normal host JavaScript privileges. Authored RashScript receives the narrower worker/interpreter capability boundary. Host CSP and same-origin policy still apply.

Legacy SWF declared-size checks and script execution duration limits do not establish a hard memory bound for compressed or malformed movies. The opaque iframe, restrictive CSP and broker reduce host exposure, but malicious SWF corpus testing and upstream emulator security review remain separate work.

Remote persistence, tenant authorization and Cloudflare account isolation are not implemented and were not assessed. The current application stores project data locally and offers explicit download backups.

## Acceptance

Run `node --test tests/security.test.js`, `npm test`, `cargo test`, and the browser suites for the exact deployment commit. Import hostile project text, run a bounded failing script, and confirm that no unauthorized elements appear and no partial scene commands are committed. Do not infer safety or compatibility from a screenshot or scorecard alone.
