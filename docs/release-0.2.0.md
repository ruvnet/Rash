# Rash 0.2.0 release acceptance

## User outcome

Create Three.js object layers, set a shared perspective camera, animate X/Y rotations and depth, and add blur, glow or blending. Six editable presets, stagger, a custom Bezier graph, bounce and elastic easing extend the timeline. Desktop and phone controls expose every new authoring action, including deletion and undo. The Beyond template demonstrates the workflow.

This is an incremental motion design release. It does not implement full Flash/ActionScript compatibility, AEP import, expressions, nested compositions, textures or interobject depth buffering. Camera settings are shared and static. See [ADR 006](adr/006-three-svg-motion.md) and the [compatibility matrix](compatibility.md).

## Automated evidence

| Gate | Result before publishing |
| --- | --- |
| JavaScript model, security, geometry, export and dependency provenance | 57 passing tests |
| Rust interpreter | 21 passing tests |
| Chromium visible 3D/motion authoring | 13 passing checks, including phone controls, actual WASM commands, reload and standalone SVG playback |
| Mobile regression | 28 passing touch checks |
| Transaction rollback | Four adversarial checks pass: composition size, stage resize, curve overshoot, valid edit and Undo afterward |
| Raster and embed export | SVG, GIF, PDF, PNG, JSON, HTML and genuine MP4 generated; green mesh pixels detected in PNG; independent players, retained nodes and reduced motion checked |
| Independent format readers | Pillow decodes six changing GIF frames containing the mesh; PyMuPDF renders the mesh in PDF; ffprobe recognizes 160 × 96 VP9 video inside MP4 |
| Cross origin runtime | Blob worker runs actual Rust WASM; 3D rotation/glow commands update projected embed geometry |
| Legacy regression | SWF playback, opaque origin, denied parent/storage/network access and disposal pass |
| Dependency advisory scan | npm audit reports zero known vulnerabilities for the pinned lockfile at review time |

The GitHub workflow additionally gates the release on existing desktop/workflow suites, Chromium and WebKit motion suites, WebKit workflows, all exporters, runtime isolation and the production build. Local browser emulation does not certify physical device performance or all mobile keyboards.

## Security and failure handling

Reviewed camera, mesh, effect, interpolation, export and Rust command boundaries. Three.js is vendored, integrity recorded, and no remote texture/model loading is introduced. Maximum mesh count is 32, maximum source triangles 4,096. Filter allocation is bounded by count and conservative animated area; export sampling has work and output byte budgets. Invalid script edits, preset operations, inspector changes, resize and curve/stage gestures leave the last valid project and history intact.

Review caught and fixed two regressions: preset key collisions changed unrelated track easing; rejected direct manipulation could leave invalid state. Sampled track preservation and adversarial rollback tests cover both. A full layer now rejects an added preset instead of silently truncating new keys.

## Performance and portability

The pinned Three.js 0.186.1 subset is 86,239 bytes, 25,323 gzip bytes. Its SHA-256 is `872a2955a4df0d57c09adefc9249cbd7e9acc179b51df2cf46d9f0a96b396f48`. Provenance and MIT license ship with it. Fixed geometry caches and retained face elements bound allocation during playback.

Final reproducible Chromium measurements on Linux with an AMD EPYC 9V74, nine visible CPUs, a 1280 × 720 viewport, 20 warmup and 100 measured frames:

| Scene | Median render | p95 render | Median / p95 frame interval |
| --- | --- | --- | --- |
| 32 boxes | 2.0 ms | 3.3 ms | 16.7 / 16.7 ms |
| 21 tori, 4,032 source triangles | 15.6 ms | 20.3 ms | 33.3 / 49.9 ms |
| Eight tori with blur and glow | 6.4 ms | 9.7 ms | 16.7 / 16.8 ms |

Headless requestAnimationFrame intervals measure scheduling opportunities, not physical screen FPS. Complex scenes can miss frames; no universal 60 FPS promise is made. Run `node scripts/benchmark-three.mjs` to collect measurements on another machine.

Animated SVG retains exact projected per-frame geometry. It is less compact than ordinary transform animation: the eight second Beyond template produces approximately 3.45 MB. Excessive exports fail with an actionable error instead of discarding geometry or silently lowering quality.

## Release record

The pull request, exact tested revision, CI runs, deployment and live Chromium/WebKit verification are recorded in the release pull request discussion. A deployed source file and runtime asset must match the accepted build before live verification is considered complete. Rollback is a revert of this release followed by the Pages workflow.
