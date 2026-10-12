---
name: rash-author
description: Create or modify Rash Studio projects, SVG animation templates, timeline keyframes, interactive scenes, and website embeds. Use for Rash authoring requests, not general Flash or SWF conversion.
---

# Author a Rash scene

1. Locate the Rash repository and read `web/core/model.js` and `docs/compatibility.md` before editing. Confirm that the requested feature exists; distinguish current support from planned AVM compatibility.
2. Choose an existing preset and template, or call `createProject('blank', preset)`. Set project `version: 1`, unique IDs, dimensions, frame rate, frame duration, background, nodes, and script. Duration and keyframe positions are frame counts, not seconds.
3. Represent artwork with supported `rect`, `ellipse`, `text`, or `path` nodes. Use text content rather than HTML. Keep colors within the schema allowlist. Do not insert raw external SVG, script elements, event attributes, or remote resources.
4. Add numeric keyframes to supported transform properties. Keep frames within `0..duration-1`. Prefer a small retained SVG scene and reusable geometry over per-frame DOM replacement.
5. Call `validateProject` and `sceneToSVG` from current source. Save project JSON, then import it in the studio and verify playback, selection, undo, and export.
6. For interaction, read `docs/runtime.md`. Use only the bounded scripting grammar and supported scene commands. Do not claim full ActionScript compatibility. A requested unsupported feature requires an implementation and regression test or an explicit limitation.
7. Produce generated embed code through the studio export flow. Test from a separate host page. Keep worker/WASM URLs relative to the hosted embed distribution; never embed credentials.

Resolve `rash://project/current`, `rash://node/<id>`, `rash://template/<id>`, and `rash://help/<topic>` through `web/core/resources.js`. These are local addresses, not network endpoints or shell commands.

Run `npm test` and `npm run test:ui` for affected workflows. Report actual command results and any unverified browser feature. Publishing is separate from generating a project; follow the user's requested deployment scope.
