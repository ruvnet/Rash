# Rash 0.3.0 release acceptance

## Delivered behavior

Animate a shared perspective camera with yaw, pitch, distance and field of view keys. Create, update, navigate and remove poses through the Scene camera dialog. A camera row appears in the timeline, and FPS changes retime camera and object keys together. Phone users reach the controls through More or the selected mesh inspector.

Each node property can now have independent timing at a shared keyframe. The Motion property selector controls easing, numeric Bezier values and graph gestures. Mixed timing is shown explicitly; changing All properties resets overrides. Presets apply timing to their own properties while preserving unrelated tracks. The Beyond template includes a subtle camera orbit.

The project stays at schema version 1. Existing scenes retain their timing and gain an empty camera track. Older players cannot reproduce new camera keys or property overrides. No additional package, network service, storage backend or Rust script capability is introduced.

## Verification and release gates

The local candidate passed 76 JavaScript unit tests and 21 Rust tests. Browser verification passed 19 editor checks, 28 mobile checks, 12 existing workflow checks, 13 motion checks, 13 new camera checks, four transactional rollback checks, the embedded game suite, runtime isolation and legacy SWF checks, and the export suite. The static build passed with pinned asset verification.

New camera checks author independent opacity and rotation curves through visible controls, prove different midpoint values, drag and undo a property curve, reset mixed timing explicitly, reload saved data, author and remove camera poses, retime FPS, and play a downloaded standalone SVG. Phone checks include camera poses, property timing, deletion, Undo and reload. A finite but unsafe Elastic camera pose is rejected with a visible filter error while preserving the document and an existing Redo entry.

Export checks cover camera-only meshes, independent timing in embedded players, sampled SVG geometry, exact PNG parity with the evaluated frame-zero camera, GIF, raster PDF, HTML and project JSON. MP4 is verified when the browser supports its container; unsupported browsers retain the explicit error. Cross-origin embeds also execute bounded Rust 3D/effect commands.

The Pages workflow repeats these checks, adding both Chromium and WebKit for workflow, motion and camera suites. The PR conversation records the exact tested head, CI outcome, merge commit, Pages deployment and public-site acceptance. Publication requires all of those gates; the local evidence above alone is not a deployment receipt. Browser emulation does not replace physical phone or native software-keyboard testing.

## Performance and size

`node scripts/benchmark-camera.mjs` reproduces the paired camera benchmark. The [source-hashed receipt](benchmarks/camera-0.3.0.json) records hardware, browser, sample counts and method. Measurements used headless Chromium 141 on an AMD EPYC 9V74 host, two runs per variant and 240 measured frames per variant.

| Scene | Static camera median / p95 | Animated camera median / p95 |
| --- | --- | --- |
| Four meshes, 408 triangles, three camera keys | 1.7 / 2.6 ms | 1.6 / 2.8 ms |
| Eight filtered boxes, 96 triangles, 1,000 camera keys | 0.5 / 0.8 ms | 2.6 / 4.8 ms |

The small first-row difference is measurement noise, not a speedup claim. Dense camera tracks add 2.1 ms median in the second scene. Direct camera evaluation adds 0.515 microseconds for three keys compared with the static camera. Renderer timings exclude browser paint, editor UI, encoders and physical mobile hardware. No universal 60 FPS claim or timing CI threshold is made.

Camera evaluation occurs once per live frame. Bounds computation avoids cloning and sorting already ordered camera tracks per filtered layer and uses no stale identity cache. The new raw-input regression checks shuffled, duplicate and nonfinite keys plus edits made in place.

Camera motion samples every affected mesh in animated SVG, including meshes with no object keys. The eight second Beyond template exports 3,448,429 bytes in this candidate. Existing limits remain 16 MB per SVG, 500,000 layer frames, 200,000 triangle frames and five million evaluation work units. Camera keys are limited to 1,000 within the 10,000 scene-key budget; property timing overrides are limited to 20,000. Three.js remains 25,323 bytes gzip.

## Security and remaining scope

The [independent targeted review](review-0.3.0.md) found no demonstrated release blocker. Camera authoring validates a candidate before assignment, and filter envelopes include camera and property easing overshoot. All new data remains allowlisted and bounded. Conservative filter limits can reject expensive scenes; their area is in SVG coordinates and is not a device-memory guarantee.

This release does not implement AEP import, expressions, nested compositions, masks, shared depth between objects, general camera scripting or complete ActionScript/Flash compatibility. [ADR 007](adr/007-camera-and-property-timing.md) records the architecture and compatibility tradeoffs. Rollback is a revert of the release commit followed by the existing Pages workflow.
