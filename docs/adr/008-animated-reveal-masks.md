# ADR 008: Animated geometric reveal masks

Status: accepted; deployment requires the release acceptance gates below.

## Outcome and scope

Give text, vector and projected Three.js layers editable wipes and iris reveals on desktop and phones. The same mask must appear in the retained stage, preview, independent embeds, still raster exports and portable animated SVG. Existing projects remain visually unchanged until a mask is enabled.

One rectangular or elliptical hard mask per layer is in scope. Feathering, inversion, freeform mask paths, references to other layers, multiple masks and nested compositions are separate features. Native RashScript does not gain mask commands in this release.

## Decision

Use SVG `clipPath` with `clipPathUnits="userSpaceOnUse"`, one allowlisted primitive per masked layer. It uses local layer coordinates and the layer transform moves the mask with its content. Clipping applies after the layer's filters. Shape and mask values are shared across live and export rendering. This follows the [SVG clipping model](https://www.w3.org/TR/SVG11/masking.html).

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Geometric clipping | One small retained definition per masked layer, no new package or image allocation | Adopt |
| Alpha masks with feather | More compositing and allocation bounds, extra browser fidelity work | Defer |
| Referenced layer masks | Cycles, missing sources and stacking semantics need a separate graph contract | Defer |

## Data and invariants

Schema version stays 1. Each normalized node gains `maskType` in `none`, `rect`, `ellipse`, default `none`. Five numeric fields are `maskX`, `maskY`, `maskWidth`, `maskHeight`, `maskRotation`. Defaults are 0, 0, node width, node height, 0. Position is bounded to plus or minus 100,000; sizes to 0 through 10,000; rotation to plus or minus 100,000. Zero size fully hides content. The five fields join `ANIMATED_PROPERTIES`, so existing per property curves, keyframes and FPS retiming apply. Unknown mask attributes and remote or executable references are discarded.

Export `MASK_PROPERTIES` and `MASK_TYPES` from model.js. `fitNodeMask(project, id, frame=0)` authors a local rectangle matching evaluated width and height, resetting local mask rotation and position. Preserve active shape; when disabled, select rect. At frame zero update base fields and an existing zero key; at later frames author the five mask values at that frame, preserving unrelated authored key values and curves. `removeNodeMask(project,id)` disables masking and clears only mask keys and mask timing overrides, dropping keys that become empty. Both mutations validate candidates transactionally and reject locked or missing layers. Return the updated node.

`wipeReveal` and `irisReveal` motion presets explicitly select rectangle or ellipse and author only mask tracks. Wipe expands width from zero to evaluated layer width. Iris expands a centered ellipse from zero to a size that covers the evaluated layer rectangle at completion, within bounds. Existing node transforms, opacity and their sampled timing remain unchanged. Stagger, full key limits and atomic multi-layer validation remain enforced. Oversized presets reject visibly rather than claiming a complete reveal.

Rendering exports shared helpers `maskId`, `maskReference`, `maskAttributes`, `maskMarkup` (or a documented equivalent agreed with the model owner). Definition IDs use a distinct namespace per live renderer and escape all serialized data. Definitions and primitives are retained during playback, removed when disabled or deleted, and updated without replacing the content node. SVG output animates mask attributes and rotation using the same evaluated node samples. Mask-only animation must not force static mesh geometry sampling. Existing evaluation and byte budgets include the five additional tracks and clip markup before allocation.

Masking never reduces the existing conservative filter allocation checks. It must not become a way to bypass effect bounds. No arbitrary SVG attributes, URL references or JavaScript execution are introduced.

## Editor behavior

Properties adds a Reveal mask section for every editable layer. Exact accessible labels: Mask shape, Mask X, Mask Y, Mask width, Mask height, Mask rotation. Shape options are None, Rectangle, Ellipse. Buttons are Fit mask to layer, Remove mask and Animate mask. Shape is a composition-wide choice; numeric values follow the current frame. Remove is one undoable transaction clearing its tracks, and Undo restores the exact project.

Motion property offers the five mask fields. Wipe reveal and Iris reveal appear in motion presets. A Mask reveal template demonstrates the feature. Locked layers disable controls. Fully clipped content remains selectable and editable from Layers. The selected layer gets a noninteractive mask outline on the stage so numeric edits remain understandable. No new pointer gesture is required in this release.

## Ownership and acceptance

Model worker owns model.js, motion.js and tests/masks.test.js. Renderer worker owns renderer.js, export/svg.js and tests/mask-renderer.test.js. Editor worker owns app.js, index.html and studio.css. Coordinator owns browser acceptance, documentation, metadata, CI, review and publication.

Acceptance: visibly author a rectangle wipe and ellipse iris; prove early and late rendered pixels differ; independently ease mask width and opacity; remove and Undo exact source; fit at nonzero frame without changing unrelated tracks; save/reload; edit and remove on phone; verify standalone SVG pixels, PNG and independent cross-origin embeds in Chromium and WebKit. Hostile mask input must remain inert, masked expensive effects must still reject, and all previous camera/mobile workflows must pass. Benchmark retained mask overhead and output size without a timing CI threshold. Merge only a reviewed commit with successful CI; verify deployed assets and public browser workflows.

Rollback: revert the release commit and redeploy Pages. Older players ignore mask fields and reveal unclipped content, so older-player visual parity is not claimed.
