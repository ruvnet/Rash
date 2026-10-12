# ADR 007: Animated cameras and independent property timing

Status: accepted and implemented. Exact commit CI and deployed acceptance remain separate release gates.

## Outcome

Animate the shared Three.js camera and give opacity, position, rotation and effects independent easing at a shared keyframe. Preserve portable SVG, existing version 1 projects, phone authoring, undo and static Pages hosting. This removes two concrete limits of release 0.2.0 without introducing a second rendering pipeline.

## Choice

| Approach | Cost and benefit | Decision |
| --- | --- | --- |
| Replace SVG with a WebGL compositor | Enables shared depth, but requires new picking, export and accessibility paths | Defer to a separate compatibility project |
| Store separate full timelines per property | Clean track separation, but requires a project migration and editor rewrite | Defer |
| Add camera keys and sparse property timing overrides | Preserves existing data and renderer; adds bounded sampling work | Adopt |

## Data and API contracts

1. Project version remains 1. `camera.keyframes` defaults to an empty array. Camera properties are `yaw`, `pitch`, `distance` and `fov`, with existing numeric bounds. At most 1,000 camera keys count toward the scene limit of 10,000 keys.
2. A node key can contain `curves: { opacity: { easing: 'bezier', bezier: [0.2, 0, 0.8, 1] } }`. Only allowlisted animated properties are retained. A missing override inherits the key's existing `easing` and `bezier`. Limit total property overrides to 20,000.
3. `keyframeTiming(key, property)` returns the effective timing. Property `all` means the legacy default. `setKeyframeTiming(key, property, timing)` changes a property override; `all` changes the default and clears overrides. Unknown properties fail explicitly.
4. `evaluateCamera(camera, frame)` returns four evaluated camera values. `addCameraKeyframe(project, frame, values = {}, timing = { easing: 'easeInOut' })` authors a bounded, validated camera pose transactionally. No camera commands are added to RashScript in this release.
5. Presets stamp their own timing only on targeted properties while preserving unrelated values and timing. Independent property interpolation and filter envelopes use the same timing resolver.
6. Camera animation must be included in conservative filter bounds. Use the minimum distance and field of view across bounded interpolated camera values, including custom curve overshoot. Renderer and exporters pass authored camera state for envelopes and evaluated camera state for projection.

## Editor behavior

The Motion inspector adds a property selector, retaining the existing all properties mode and accessible labels. Easing, numeric Bezier handles, curve dragging and presets update the selected property. Controls for an unauthored property are disabled with an explanation. Edits remain one undoable focus or pointer transaction.

The camera dialog adds an exact frame, easing, keyframe creation, keyframe removal and keyframe navigation. Applying a base camera pose remains distinct from authoring a pose at the current frame. A camera timeline row appears when camera keys exist. FPS changes retime camera and object keys together. Phone users access the same controls through More and Scene camera.

The Beyond template gains a bounded camera animation as a discoverable example. No shared depth buffer, AEP importer, expression evaluator or complete Flash compatibility is claimed.

## Rendering and export

Evaluate a camera pose once per live or still frame. Animated SVG samples geometry for every mesh affected by a camera track, including meshes without object keys. Camera evaluation and those additional mesh frames count toward existing work, triangle frame and byte budgets. Compute bounds from authored tracks, never from a previously evaluated overshoot. Keep retained mesh faces and the pinned Three.js module unchanged.

## Ownership and gates

Model worker owns `model.js`, `motion.js` and camera/timing unit tests. Rendering worker owns renderer, SVG export and projection/export tests. Editor worker owns app, HTML and CSS. Coordinator owns ADR, browser acceptance, dependency/build metadata, documentation and deployment. Security review is read only against frozen source.

Acceptance: author two camera poses through visible controls, scrub and observe changing paths; set rotation linear and opacity ease out at the same frame and prove different midpoint values; drag a property curve, undo, reload and export; verify standalone SVG, a third party embed and raster output; repeat authoring on a phone viewport and WebKit. Adversarial camera/filter combinations must leave the document and history unchanged. Existing mobile and release suites must pass before merge and public asset verification.

Rollback: revert the release commit and rerun Pages. Older releases ignore new camera keys and timing overrides, so exported projects preserve the data but older players cannot reproduce the new motion.
