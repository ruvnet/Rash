# Targeted v0.2.0 release review

Reviewed 12 October 2026 on `feat/three-motion`. No remaining demonstrated release-blocking defect was found in the reviewed implementation after the fixes below. This is a targeted source and regression review, not comprehensive security certification, complete Flash compatibility, or acceptance of every browser/device.

## Scope and trust boundaries

The attacker may control imported project JSON, timeline keys, camera and effect values, scene text, or RashScript. Assets at risk are browser availability, the authoring document and undo history, and the embedding page. The review covers the new Three.js projection, model and motion changes, retained SVG rendering, SVG export preflight, editor transactions and controls, and new Rust/editor/embed property bindings. It does not audit upstream Three.js internals or re-audit the optional Ruffle binary.

Projected geometry remains fixed-topology, bounded numeric data. New primitive and blend names are allowlisted; SVG attributes and text are escaped. The editor and embed validate the complete candidate after Rust commands and before committing or rendering it. The interpreter adds explicit properties rather than DOM, network, shader or expression execution. Static hosting introduces no new server credential or persistence boundary.

## Confirmed issues and verification

| Issue | Concrete reproduction | Resolution verified |
| --- | --- | --- |
| Preset changes unrelated timing | Rotation keys at frames 0 and 30, values 0 and 90, linear timing: frame 15 was 45°. Adding a 30-frame opacity fade changed it to 67.5° because the shared ending key acquired `easeOut`. | Merging a preset preserves the existing easing and Bezier handles when the key contains an unrelated track. The regression samples 61 half-frame positions for all six presets with both linear and custom Bezier rotation. Shared timing is an explicit model compromise: the newly added preset may inherit existing timing. |
| Invalid direct edits can escape normal transactions | A filtered rectangle grows from 1000 to 3200 units; a curve handle introduces an overshoot whose conservative filter envelope exceeds the budget. Composition scaling and stage resize can similarly make a valid scene invalid. | Pointer gestures capture the document and history, validate before rendering, and restore the complete gesture on rejection. Composition resize uses the existing transaction and keeps its modal open with an error. Four independent browser assertions passed for resize rejection, stage-handle rollback, Bezier rollback, and a subsequent valid fill edit followed by Undo. No page errors occurred. |
| Bounds may drift while rendering an overshoot | Deriving an animation envelope from an already evaluated mesh re-applies track deltas at each frame. | Live, still, and animated exports derive filter bounds from the authored node. The renderer regression checks every frame of a 120-frame overshooting mesh against the same validated envelope. |
| Preset can silently truncate a full keyframe layer | A layer already contains 1000 unrelated keys; adding preset keys beyond that range previously reached the normalizer's truncation. | Preset construction rejects the candidate before assigning it. The unit regression retains the original serialized document on failure. |

The final source also retains lock checks for node edits, curve gestures, keyframe placement and presets. Composition camera changes are document-level edits. Effects and camera state survive project serialization; legacy version 1 documents acquire bounded defaults.

## Independent evidence

- `node --test tests/security.test.js tests/motion.test.js tests/three-renderer.test.js tests/three-provenance.test.js`: **35 passed** on the final reviewed source. These include hostile attributes, text amplification, embed loading policy, actual WASM capability rejection, unrelated-track preservation, geometry and effect bounds, and export work rejection.
- `node web/runtime/verify.mjs`: passed against the actual 222,992-byte Rust WASM asset, including new rotation, glow, primitive and wireframe commands. Its 120-run local smoke measurement was median 0.706 ms and p95 1.609 ms; this measures a small interpreter workload, not scene frame rate.
- The four rollback checks were independently rerun from the implementation agent's standalone reproduction. That reproduction is preserved as `tests/rollback-browser.mjs`; it uses Chromium mouse pointer input and should not be represented as physical phone testing.
- `npm audit --json`: zero reported vulnerabilities for the current lockfile, queried 12 October 2026. The response supplied no advisory-feed timestamp. This does not cover Rust or vendored WASM dependencies.

The Ruflo security-audit skill guided the read-only scope and evidence rules. No Ruflo heuristic scanner or `cargo audit` run is claimed. Other desktop, touch, WebKit, export, runtime and deployment acceptance results belong in the release evidence; they are not inferred from these checks.

Review tools: Node 24.19.0, npm 11.9.0 and Playwright 1.56.1. `git diff --check` passed.

## Resource and compatibility limits

Validation caps a scene at 32 mesh layers and 4096 triangles. Blur/glow layers are limited to 64, with conservative local filter envelopes capped individually and in aggregate. The filter-area calculation is in local SVG coordinates, not a universal bound on device pixels, GPU memory or render time. Browser zoom, transforms and device pixel ratio still matter.

SVG export preflights layer-frame work, keyframe evaluation work, triangle-frame work, and estimated output bytes before sampling; it also checks final serialized bytes. It can intentionally reject a valid authoring scene that is too expensive to export. Frame groups preserve projected geometry but are not a general-purpose streaming 3D format.

Meshes have per-object projection and internal face ordering; SVG layer order determines overlap between separate objects. There is no shared depth buffer, arbitrary mesh/material importer, After Effects project importer, expression engine, Stage3D implementation or full ActionScript support. Numeric effect limits and measured headless tests do not establish universal 60 fps or physical mobile performance. Raster and vector exports preserve supported timeline state, not arbitrary scripted/game execution.

## Reviewed asset identity

| Asset | SHA-256 |
| --- | --- |
| `package-lock.json` | `99a4be57b3e5f1cc6aa7130b0c78d97d53338a6472557447b03a2e23ebfc57e8` |
| `web/app.js` | `79a6fd57bb45e7c16663683d0386ea9f3c878e68e9f35dc0e7fdd931651f78a5` |
| `web/core/model.js` | `dc181a153bc48e539d7d376205851e088ae0c5d93facd9e54325de83e458c115` |
| `web/core/motion.js` | `6dd5c20a246734b08f9947e52d42b156f1cc90d0b175b22533c73367de58dde2` |
| `web/core/renderer.js` | `b6e2adc1c5004e4616b7428aff7220cb3809a43506b416cc02fc85edee8a0936` |
| `web/core/three-svg.js` | `b46a8caed46a0029f15e20716361c31e23aa82f11727caeba182b36c1c2c27b1` |
| `web/export/svg.js` | `5abba1ebb52321f519e95ff0d7f618b02eb549cfcd7d413c2326850cbc83031a` |
| `web/embed.js` | `b3a2c86972fd785cbdad44374740a5cc637c2919bcce4097c73a50d2aaa86477` |
| `web/runtime/pkg/rash_runtime.wasm` | `9654a2fc4b4e4532eb0baac7d176eb188765fed6d83f702bc3cd294b5e907a0e` |

Three.js is pinned to 0.186.1 and esbuild to 0.28.2. The MIT license and upstream integrity are preserved with the vendored asset. The verified bundle is 86,239 bytes / 25,323 gzip, SHA-256 `872a2955a4df0d57c09adefc9249cbd7e9acc179b51df2cf46d9f0a96b396f48`.

This report is frozen to those source identities. A release still requires successful CI and browser/deployed-asset acceptance for its exact commit.
