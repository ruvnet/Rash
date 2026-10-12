# Targeted v0.4.0 release review

Reviewed 12 October 2026 on `feat/animated-reveal-masks`, against ADR 008 and the source identities below. No demonstrated release blocking security or correctness defect remained in the reviewed changes. This assessment is limited to animated geometric masks and their affected authoring, rendering and export boundaries.

## Scope and threat model

An attacker may control imported project JSON, node IDs, mask geometry, keyframes and timing metadata. Protected assets are browser availability, the authored document and undo history, and the embedding page. The reviewer inspected model normalization and mutation helpers, reveal presets, live editor transactions, SVG clipping, export allocation checks, and the interaction with existing Rust commands. The review was read only except for this report.

The release adds no dependency, network endpoint, storage service or script execution primitive. Project import remains bounded to 5 MB. Existing host JavaScript privileges, runtime worker limits and local browser storage responsibilities remain as described in `security.md`.

## Findings

| Boundary | Reviewed behavior and evidence |
| --- | --- |
| Hostile project fields | Only `none`, `rect` and `ellipse` mask shapes survive normalization. Five finite numeric properties have explicit bounds; zero dimensions are supported. Remote references, event attributes and prototype related metadata are discarded. |
| SVG definitions | Clip definitions contain one allowlisted primitive in local coordinates. IDs use a mask namespace and sanitized node IDs; distinct live renderer instances receive different prefixes. Serialized values are escaped, and project validation rejects colliding normalized node IDs. No imported URL becomes a clip reference. |
| Retained renderer | Definitions and primitives are retained during numeric playback, removed when disabled or deleted, and replaced only when the shape changes. Content nodes remain retained. The selected mask outline cannot capture pointer events. |
| Filter allocation | Masks do not participate in the conservative filter envelope calculation. A completely closed mask cannot make an oversized blur, glow or unsafe projected mesh pass validation. Export clipping wraps the filtered body; live and still output use the same local clipping geometry. |
| Sparse transactions | Fit edits only five mask tracks. Remove clears only those tracks and their timing overrides, dropping empty keys. Presets stage all selected layers in a cloned candidate and validate before assignment. Locked, missing, oversized and over budget edits reject atomically. |
| Inspector and history | Numeric mask edits at nonzero frames author sparse keys rather than snapshotting unrelated tracks. Shape None invokes the same track removal helper as Remove mask. Editor transactions restore the prior document and history on rejection. The independent browser probe below verifies an existing Redo entry survives. |
| Export budgets | Adding mask properties increases the evaluation work calculation automatically. Static clip markup and sampled geometry and rotation values receive additional byte estimates before sample allocation. The final animated output also has an encoded byte check. Mask only motion leaves otherwise static mesh geometry unsampled; camera motion still triggers the existing triangle frame limit. |
| Rust boundary | The host numeric command allowlist inherits the five animated mask properties, but the Rust assignment allowlist does not expose them. Actual WASM rejects every mask assignment and discards earlier commands in the failed run. No new RashScript mask capability is claimed. |

## Independent validation

`node --test tests/masks.test.js tests/mask-renderer.test.js tests/security.test.js tests/motion.test.js` passed **48 tests**. Cases include hostile fields and IDs, zero sized clips, independent mask and opacity curves, sampled preservation of unrelated animation, exact project roundtrips, locked and missing layers, layer and aggregate key limits, timing override limits, atomic multi layer presets, filter bounds, all five renderable layer types, static mesh retention, SVG allocation limits and the existing import, embed and WASM security regressions. `git diff --check` passed.

A separate Chromium probe used visible authoring controls and an imported project fixture:

1. Import one rectangular masked layer with 1,000 existing position keys and a 2,000 frame composition.
2. Change fill to `#123456`, then Undo, leaving the fill change available for Redo.
3. Seek to UI frame 1201 and enter Mask width 500. The layer has no key at that frame, so the new sparse key would exceed its limit.
4. Verify the visible 1,000 key error and exact unchanged project. Redo restores the earlier fill while mask width remains 100.

The probe passed with no uncaught browser errors. A separate actual WASM check attempted assignments to `maskType`, `maskX`, `maskY`, `maskWidth`, `maskHeight` and `maskRotation`, each preceded by a valid position assignment. All six returned the unsupported property error and an empty command list.

The pinned `@claude-flow/cli@3.25.6` command `security scan --target web/core --depth deep --type all` completed with zero reported signals. This heuristic result is supplementary evidence, not proof that the application has no vulnerabilities. It did not scan the complete repository. No fresh vulnerability advisory query was performed; no advisory feed timestamp or dependency clean claim is made. The lockfile identity below records the dependency baseline reviewed here. Node was 24.19.0 and Playwright was 1.56.1.

## Limits and acceptance gate

This release supports one rectangular or elliptical hard clip per layer. Feathering, inversion, referenced layers, arbitrary imported mask markup, multiple masks and nested compositions are outside the reviewed implementation. Fit and reveal presets use authored layer width and height, not measured text glyph bounds or the full projected extent of 3D faces; authors can enlarge a clip numerically when content extends outside that rectangle.

Schema version remains 1 and older projects default to disabled masks. Older players ignore these fields and can reveal previously clipped content. Masking is a visual effect and must not be used to redact confidential content from a project or exported SVG, which still contains the clipped data.

Filter limits remain expressed in local SVG coordinates, not guaranteed device pixel or browser memory bounds. Large valid projects can still be expensive. Browser emulation does not establish physical phone keyboard behavior or universal frame rates. This reviewer did not independently rerun the full desktop, phone, WebKit, raster, embed or public deployment matrices; the coordinator must record those separate results against the published commit.

Acceptance requires successful exact commit CI, desktop and touch mask workflows, WebKit parity, standalone SVG and raster pixels, independent embed playback, and matching deployed source identities. A failure should block publication or cause rollback to the preceding release.

## Reviewed source identity

| Asset | SHA 256 |
| --- | --- |
| `web/app.js` | `d50856a02cea8e8b4e1bee195d1aa9d1fb53dae39c8b3e741b560d2cab817054` |
| `web/core/model.js` | `2e184ef0bfd0c711cb43d36c8a961d4077896b94ef1d4e5bd309e8983490d800` |
| `web/core/motion.js` | `d912351151b47112cf6a487ae24ef322ff86b70c4f0004752221a1293f71d374` |
| `web/core/renderer.js` | `e20763a7c183547394bc4caca14be822888920e0be1d9b467d87cc029ea32202` |
| `web/export/svg.js` | `f7939d7e8248d564c2ca1269edd1dff9115963a59d357c0b7723a16096882c7f` |
| `web/styles/studio.css` | `88a305dd4908fa1afb00a0a303403f0ab4785311e3807c40b5fc050eb542c6e2` |
| `package-lock.json` | `0fed7d9487ab7cf95386106c0f2c609a7c92f79c317927b25b784a92ecb1d9d5` |

This report is frozen to these source identities. Subsequent source changes require review of their delta. A package version only metadata change does not alter the reviewed dependency versions, but its new lockfile hash must be recorded in release evidence.
