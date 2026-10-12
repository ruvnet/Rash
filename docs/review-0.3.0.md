# Targeted v0.3.0 release review

Reviewed 12 October 2026 on `feat/camera-track-timing`, against ADR 007 and the source identities below. No demonstrated release-blocking security or correctness defect remained in the reviewed changes. This review does not certify full Flash compatibility, universal performance, or acceptance on every browser and device.

## Scope and threat model

The reviewer inspected animated camera data, independent property timing, preset merging, live editor transactions, retained SVG rendering and portable SVG export. The attacker may control imported project JSON, camera keys, node keys and timing metadata. The protected assets are browser availability, the authoring document and undo history, and the embedding page. The review is read only; no implementation files were changed by the reviewer.

No new network endpoint, storage service, script capability or dependency version is introduced by this feature. The existing Rust worker and project-import boundaries remain relevant but were not comprehensively re-audited. The security-audit skill guided scope and evidence handling; no Ruflo heuristic scan or new vulnerability-advisory query is claimed.

## Review results

| Boundary | Reviewed behavior and evidence |
| --- | --- |
| Legacy projects | Version remains 1. Missing camera tracks become an empty array. Missing property overrides retain existing shared easing. Roundtrip and sampled interpolation tests preserve legacy behavior. Older players cannot reproduce the new fields, so forward playback compatibility is not claimed. |
| Timing metadata | Only allowlisted node properties and easing names survive normalization. Bezier values are bounded. Prototype-related fields remain inert. A property override changes only that track; explicitly editing All properties clears overrides as the UI explains. |
| Preset merging | Presets author curves for their own properties while preserving unrelated default timing, overrides and samples. This removes the v0.2 shared-timing compromise rather than silently replacing another track's easing. |
| Camera authoring | Camera poses are staged in a cloned candidate, validated together with node/filter state, and assigned only after success. The editor wraps this in its document/history transaction. Base-pose edits preserve camera keys; key creation, removal and frame navigation have separate controls. |
| Filter envelopes | Dimensions use effective per-property timing. Camera bounds include the minimum interpolated distance and field of view, including bounded expressive overshoot. Live rendering and exports use authored tracks for envelopes and evaluated poses for projection. |
| Bounds optimization | The final implementation avoids cloning every camera key for every filtered layer. It has no identity cache that could become stale after an edit. Camera count and key shape are checked; unordered or duplicate frames are normalized before envelope traversal; numeric values are bounded during traversal. |
| Export work | Camera-only motion forces geometry samples even on meshes with no object keys. Camera evaluation work, affected mesh frames, triangle frames and output estimates are checked before allocating sample arrays. A camera track with no mesh does not manufacture needless SVG animation. |
| Editor state | Property timing selectors, numeric curves and pointer curves use existing live-edit or gesture transactions and lock guards. Camera poses use visible modal errors on rejection. The adversarial browser probe below verifies preservation of both the document and an existing Redo entry. |

## Independent checks

`node --test tests/camera-motion.test.js tests/camera-renderer.test.js tests/security.test.js tests/motion.test.js` passed **44 tests**, including a rerun after the camera-bounds optimization. Coverage includes independent opacity/rotation midpoint values; unchanged samples of unrelated tracks; hostile timing metadata; legacy roundtrips; camera and scene key limits; the override limit; camera/filter overshoot rejection; camera-only and combined object/camera export geometry; exact authored filter envelopes; and existing import/embed/WASM security regressions. `git diff --check` passed.

After the final model regression was added, `node --test tests/camera-motion.test.js` passed all **11 model tests** on unchanged implementation hashes. Its additional case verifies equivalent envelopes for shuffled/duplicate/non-finite raw camera keys, visible changes after in-place mutation, and rejection of malformed or oversized camera tracks.

A separate Chromium probe exercised an adversarial camera edit through visible controls:

1. Start with a blank project, a sphere mesh of width and height 900, glow 1, base camera distance 1000, and a linear camera key at frame 0 with distance 1000.
2. Make a fill edit to `#123456`, then Undo, leaving that edit available for Redo.
3. Open Scene camera, enter UI frame 61 and distance 740, choose Elastic, and press Set camera keyframe. These values are individually within the numeric ranges. The same pose with Linear timing passes validation; Elastic's conservative overshoot envelope exceeds the filter budget.
4. Verify the visible filter-budget error, retained modal, exact unchanged project and single existing camera key. Close the dialog and Redo; verify the earlier fill edit is restored exactly.

Both assertions passed with no uncaught browser errors. This is a desktop Chromium probe using touch-compatible controls; it is not evidence from a physical phone. The fixture and procedure were supplied to the coordinator for inclusion in `tests/camera-browser.mjs`.

Tools were Node 24.19.0 and Playwright 1.56.1. The dependency changes reviewed here update package version metadata only; Three.js remains 0.186.1 and esbuild remains 0.28.2. The prior v0.2 advisory result is recorded in `review-0.2.0.md`; no fresh advisory-feed timestamp or dependency-clean claim is made here.

## Limits and release gate

The camera is one shared perspective pose with a single easing per camera key. Independent timing overrides apply to node properties. This release adds no camera commands to RashScript, general expression engine, shared inter-object depth buffer, arbitrary mesh/material import or full ActionScript implementation.

Limits are 1000 camera keys counted within 10,000 scene keys and 20,000 node-property timing overrides. Existing mesh, filter and export budgets still apply. Filter area is measured in local SVG coordinates, not a guaranteed device-pixel or memory bound. Conservative envelopes may reject a pose whose actual rendered extrema would be smaller. Bounded work can still be expensive near the limits; this review makes no universal frame-rate claim.

The reviewed code is ready for the separate exact-commit CI, desktop/touch/WebKit, raster/export, third-party embed and deployed-asset acceptance gates. Those results must be recorded as release evidence rather than inferred from these targeted tests.

## Reviewed source identity

| Asset | SHA-256 |
| --- | --- |
| `web/app.js` | `30f4826acfdd11e5f1b76d497d278ffa8197766d16eb89905334e96b2e6255cd` |
| `web/core/model.js` | `1e4096b4bccdb87381778f45ca373b79b8e7b9fbd83f10cfd6efdf6bd09301c4` |
| `web/core/motion.js` | `420df27574f48253d0ece83d773042473ed3b44110667b2009e4647d68d4ab95` |
| `web/core/renderer.js` | `b87565086368dd2cfcab578c02964b8f3d14bc47d887912c85690a3af14ace49` |
| `web/export/svg.js` | `10b6a3e03e60446ec33d7c6829395778bd0b917a55e26584695fad46f182d6d0` |
| `package-lock.json` | `0fed7d9487ab7cf95386106c0f2c609a7c92f79c317927b25b784a92ecb1d9d5` |

This report is frozen to these source identities. Later changes require review of their delta.
