# Rash 0.4.0 release acceptance

## Delivered behavior

Every text, vector and projected Three.js layer can have one rectangular or elliptical hard reveal mask. Properties exposes local position, dimensions and rotation, Fit mask to layer, Remove mask and Animate mask. The five numeric fields support sparse keyframes and independent property easing. Wipe reveal and Iris reveal presets preserve unrelated sampled animation. The Mask reveal template is available at all seven sizes.

Removing a mask, or choosing None, clears only its tracks and timing overrides in one undoable transaction. Fit authors only mask values at the current frame. Locked layers disable all mask controls. Phone users can select a fully clipped layer from Layers, open Edit, change its mask, remove it and Undo. A noninteractive outline shows the selected mask on the stage.

Live SVG, independent embeds, still raster exports and standalone animated SVG share evaluated clip geometry. Each renderer owns its clip namespace. Numeric playback retains definitions, primitives and content. Mask only animation does not resample otherwise static 3D geometry.

Schema remains version 1. Existing projects default to disabled masks. Older players ignore mask fields and show unclipped content. No new package, network service, storage backend or Rust scripting capability is introduced.

## Verification and gates

The candidate passed 98 JavaScript unit tests, including 13 model/motion mask tests and nine renderer/export mask tests. The new Chromium suite passed 13 checks through visible controls and actual rendered pixels. Existing mobile and workflow suites passed 28 and 12 checks. The independent targeted review passed 48 overlapping unit tests plus separate rejected edit and actual WASM probes. Counts overlap and must not be added as independent coverage.

New browser acceptance authors rectangle wipes and ellipse irises; compares zero, partial and full pixels; proves independent mask width and opacity easing; tests sparse Fit, Remove, None and exact Undo; enforces locks; reloads saved data; opens the template wizard; verifies downloaded animated SVG playback; checks exact PNG pixels and two cross origin embed instances; and repeats authoring and removal on an emulated phone. Both Chromium and WebKit are release gates.

The Pages workflow also runs Rust tests and a WASM rebuild, all JavaScript tests, editor, mobile, workflow, motion, camera, rollback, game embed, export and runtime isolation suites, then the static build. Workflow, motion, camera and mask suites run in both Chromium and WebKit. Rust is unavailable in this local checkout; local JavaScript tests execute the checked in WASM, and source Rust validation is an explicit CI gate. PR evidence records the tested head, complete CI result, merge and deployment, public browser acceptance and matching live source hashes. This document alone is not a deployment receipt.

## Performance and size

`node scripts/benchmark-mask.mjs` reproduces the [source hashed benchmark receipt](benchmarks/masks-0.4.0.json). Headless Chromium 141 on an AMD EPYC 9V74 host sampled 120 frames per condition in alternating disabled/enabled order. Both conditions evaluate identical keys; the difference isolates clip definition and attribute updates.

| Scene | Without clipping median / p95 | With clipping median / p95 | Median increase |
| --- | --- | --- | --- |
| 200 rectangles | 0.7 / 1.0 ms | 1.6 / 2.1 ms | 0.9 ms |
| 32 boxes | 0.6 / 1.2 ms | 0.8 / 1.0 ms | 0.2 ms |

Times cover synchronous scene evaluation and SVG updates, excluding paint, editor panels, encoders and physical mobile hardware. There is no universal FPS claim or timing CI threshold. The script also verifies retained identity, renderer namespace isolation, shape replacement, disable/delete cleanup and static mesh retention.

A 120 frame mask only box SVG measures 6,079 bytes, or 1,693 bytes gzip, compared with 745 bytes and 332 bytes gzip without clipping. It contains one static mesh, not repeated triangle frame groups. Three.js remains 25,323 bytes gzip. Export preflight counts the five new tracks, static clip markup and sampled mask values within the existing 16 MB, layer frame, triangle frame and evaluation budgets.

## Review and limitations

The [independent targeted review](review-0.4.0.md) found no demonstrated release blocker. Hostile fields are discarded, all mask values are bounded, clip references are local and scoped, and masks cannot reduce filter allocation envelopes. A rejected 1,001st layer key preserves the complete document and existing Redo. Actual WASM rejects mask assignments with no partial commands.

The reviewed lockfile received only the package version bump to 0.4.0. Dependency versions are unchanged. Final lockfile SHA 256: `6ced445587b9bd9c779e43ca94f5d399c973ac5482066a00608229de3a6b953f`.

Masks are hard geometric clips, with no feathering, inversion, freeform paths, referenced layers or nested compositions. Fit uses authored width and height rather than measured glyph or projected face bounds; enlarge the mask when content extends beyond those dimensions. SVG retains clipped source content, so masking is not redaction. Browser emulation does not prove physical phone keyboard behavior. Full ActionScript/Flash compatibility, AEP import and expressions remain outside this release.

[ADR 008](adr/008-animated-reveal-masks.md) records the decision. Rollback is a revert of the release commit followed by the existing Pages workflow.
