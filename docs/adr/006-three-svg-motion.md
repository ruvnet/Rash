# ADR 006: Three.js object layers and editable motion design

Status: accepted for implementation; release acceptance remains a separate gate.

## Outcome and constraints

Create animated 3D artwork and motion graphics through visible desktop and mobile controls, without abandoning portable SVG output. Existing version 1 projects, touch editing, undo, script isolation, and static GitHub Pages hosting must continue to work.

The feature is a set of Three.js projected object layers and motion design tools inspired by After Effects. It is not an After Effects file importer, expression engine, or complete 3D compositor.

## Options

| Approach | Delivery and runtime cost | Export behavior | Main risk |
| :--- | :--- | :--- | :--- |
| WebGL overlay | Requires separate picking, rendering and raster capture paths | SVG cannot preserve GPU shaders and textures | Editor and exports diverge; mobile GPU/context failures |
| Three.js SVGRenderer addon | Useful upstream geometric SVG renderer; DOM dependent | Additional headless DOM path needed for Node exports | Harder shared deterministic scene generation |
| Three.js geometry and camera with bounded SVG projection | One geometry implementation used by editor, embed and exporters | Vector paths remain inspectable and portable | CPU cost grows with faces and sampled frames |

Choose the third option. Use pinned Three.js 0.186.1 geometry, matrices, camera and color modules. A reproducible esbuild 0.28.2 bundle contains only the required source modules. Initial measurement is 86,239 bytes, 25,323 bytes with gzip. Record source integrity, bundle hash, builder version and MIT license with the asset.

Upstream references: [SVGRenderer](https://threejs.org/docs/pages/SVGRenderer.html), [PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html).

## Contracts and ownership

* `model.js` validates mesh primitives, 3D transforms, camera, bounded effects and cubic Bezier handles. It remains the canonical project and interpolation boundary.
* `motion.js` translates named presets into ordinary editable keyframes. Applying a preset is an undoable transaction and refuses locked layers.
* `three-svg.js` caches fixed low polygon geometries, projects and shades their faces using Three.js, and returns finite safe SVG path data. No external meshes, textures, shaders or executable expressions are imported.
* `renderer.js` retains object and face elements and applies SVG filter primitives for blur and glow. The same renderer supplies still exports, GIF, MP4, PNG and PDF capture.
* `export/svg.js` samples actual projected mesh geometry and animated effect values with explicit work and byte budgets. It must reject an excessive export before allocating its full output.
* `app.js` provides object creation, camera settings, 3D transforms, motion presets, editable easing curves and effects through visible controls on phones and desktop.

Every 3D object is projected into its own layer coordinate space. Camera orientation and perspective are shared composition settings. SVG painter order determines overlap between layers; this does not implement intersecting meshes with a shared depth buffer. Existing X/Y position and 2D rotation preserve their authoring meaning.

## State and failure behavior

1. A visible control stages a project mutation through existing history and validation.
2. Numerical controls commit while typing without replacing their focused DOM. Dependent controls and cached values synchronize together.
3. Interpolation evaluates each bounded property at a frame. Cubic Bezier X is inverted to obtain the correct time parameter; a handle's X is constrained to the unit interval.
4. Geometry uses fixed topology and face identifiers. Projection, backface visibility and depth ordering are deterministic for the same scene and frame.
5. Rendering and export consume the same evaluated properties. Invalid inputs and excessive output fail with an actionable error while retaining the valid authoring document.

No expression eval, network access, new server, account system or paid rendering service is introduced. Three.js and all runtime assets are served from the same static origin. Rollback is a revert of the release commit and rerun of the Pages workflow; downloaded project files preserve authorship data.

## Acceptance

| Requirement | Evidence required before release |
| :--- | :--- |
| Real 3D objects | Geometry tests, visible primitive creation, and projected path changes after X/Y rotation and camera edits |
| Motion design | Presets create real keys; custom curve changes interpolation; effects alter rendered and exported SVG |
| Mobile access | Touch creation, editing, camera, motion controls, deletion and undo at a phone viewport |
| Portable output | Animated SVG contains changing 3D geometry and effects; embed playback matches project data; raster exports contain the scene |
| Safety | Invalid curve/camera/mesh fields normalize safely; mesh and export work budgets reject amplification; CSP and script isolation remain intact |
| Performance | Report render measurements, scene complexity, browser and hardware; do not equate headless timing with physical phone frame rate |
| Regression | Existing unit, Rust, desktop, 28 touch and WebKit workflows plus export/runtime suites pass for the release revision |

Preserve the exact tested commit, dependency provenance, CI run and deployed asset hashes in the release evidence.
