# Rash compatibility

Rash is a new SVG animation studio with a Rust WebAssembly scripting runtime. It is **not yet a complete Adobe Flash replacement**. Full ActionScript, AVM1, AVM2 and SWF compatibility remain substantial implementation work. Screenshots, an authoring UI and a source interpreter do not establish legacy content compatibility.

This document describes the current source, with precise limits. Release acceptance also requires the automated test and browser evidence for the deployed commit.

| Area | Current implementation | Limit or missing feature |
| --- | --- | --- |
| Stage | Retained SVG vectors, Three.js projected box/sphere/torus/pyramid layers, animated rectangle/ellipse masks, blur/glow and four blend modes | No general SVG import, feathering, inverted or referenced masks, textures, shaders or arbitrary filters; 3D objects use SVG layer order rather than shared depth |
| Timeline | Numeric transform/effect/mask keyframes, editable presets, stagger, Bezier graph, bounce/elastic easing, playback and frame sampling | Nested graphic symbol timelines share the document FPS; no AEP import, expressions, Flash shape tween or frame event graph; per property easing and Bezier overrides are supported |
| Symbols | Reusable graphic definitions, nested instances, shared editing, independent transforms and Loop, Play once or Hold one frame playback | Parent synchronized clocks only; no independent MovieClip events, Button symbol states or symbol scripts; no blur/glow on symbol containers |
| Camera | Animated orbit, distance and field of view for projected objects in each scene or symbol definition | Up to 1,000 camera keys per scope; symbol cameras follow their local clock; no WebGL depth buffer |
| Document | Version 1 flat projects remain supported; creating a symbol upgrades to version 2 with a shared library; web, social, story, HD, A4 and classic presets | 128 definitions, eight nesting levels, 1,000 stored and expanded layers, 5 MB import limit; version 2 requires a current player |
| Scripting | Rust source parser and interpreter in a dedicated worker | RashScript subset; not a full ActionScript compiler or AVM |
| Variables | Numbers, strings, booleans, null, declarations and accepted type annotations | Annotations do not implement AS3's type system; no object/class model |
| Control flow | If/else, for, while, break, continue, arithmetic and comparisons | No user functions, classes, packages, imports, exceptions or switch |
| Scene commands | Allowlisted property writes, timeline commands, trace, selected Math functions | No DOM, network, filesystem, eval, dynamic code or Flash API imports |
| Legacy content | Optional self hosted Ruffle 0.7.1 SWF player, isolated from the studio | Upstream AVM1/AVM2 compatibility limits; no FLA import or SWF editing; network, storage and ExternalInterface disabled |
| SVG export | Animated numeric tracks, nested graphic symbol clocks, projected 3D frame groups, native filter and geometric clip animation | No project scripts; 16 MB output, 200,000 source triangle frames, 500,000 layer frames and 5 million evaluation work budget |
| HTML export | Standalone HTML with animated SVG | Timeline animation only; not a full project runtime |
| JavaScript embed | Custom element using hosted assets, shared symbol definitions and independent player state | A version 2 project requires a version 2 capable bundle; host CSP, HTTPS/CORS and worker support must allow the asset path |
| GIF export | Browser rasterization and local GIF encoder | 640 px longest edge, at most 120 sampled frames, at most 60 seconds; no audio |
| MP4 export | Canvas capture and actual MP4 MediaRecorder capability detection | Browser dependent; at most 60 seconds and 1920 px longest edge; real-time capture may skip frames; no audio |
| PDF export | First-frame raster image in a PDF container | Not an animated or editable vector PDF |
| PNG export | Rasterized first frame | Static output |
| Game template | A small interactive collection game | Not a complete physics or general Flash game engine |
| Template search | Real optional RuVector WASM cosine search, local fallback | Deterministic hashed lexical vectors; not learned semantic embeddings |
| MetaHarness | Pinned optional static repository scorecard plus independent local tests | No autonomous evolution or demonstrated self learning |
| Persistence | Browser local autosave and JSON backup | No account, cloud sync or remote collaboration |
| Cloudflare | No production Cloudflare dependency | Authentication and tenant storage require a separate implementation |
| Claude package | Manifest, marketplace and authoring/verification skills | Passive workflows; no autoexec hooks or live MCP server |
| Interface | SVG stage with HTML editor controls | Controls are accessible HTML, not a recreation of a whole browser UI in SVG |

## Graphic symbol boundary

A graphic symbol is a shared definition with its own dimensions, camera, layers and duration. Instances reference it by `symbolId`. Changing the definition updates every instance; position, size, rotation, opacity, mask, blend mode and playback settings belong to each instance. Supported blur and glow remain available on artwork layers inside a definition. They are rejected on symbol containers because nested filter bounds are not implemented for that case.

All timelines use the document FPS. `firstFrame` and `startFrame` are zero based in JSON and displayed as one based frame numbers in the inspector. Before `startFrame`, an instance holds its selected first frame. Loop wraps its local clock; Play once stops at the last symbol frame; Hold one frame samples a fixed frame. Nested instances repeat that mapping through each parent. Seeking and exported frame sampling are deterministic, without a separate MovieClip event loop.

Library supports creating, renaming, placing and editing symbols. The editor converts a selected layer, including another symbol instance, while preserving its geometry and authored timing. **Back to Scene** leaves definition editing. Undo and Redo retain the complete document and editing context. Autosave, project download, embeds and media exports always use the complete root scene and library, even when a definition is open. Definition deletion is rejected while references remain anywhere in the project.

Version 1 files retain their flat schema. Adding a symbol explicitly creates a version 2 document. An older player rejects that version instead of silently dropping the library. Removing every symbol does not automatically downgrade the file. Keep the studio, player and hosted module assets from the same release when distributing version 2 projects.

## Language boundary

See [runtime.md](runtime.md) and `crates/rash-runtime/src/lib.rs` for the implemented grammar and command semantics. Strict equality and coercion behavior are deliberately bounded and should not be assumed identical to ECMAScript or AS3. Unsupported features produce errors. Errors return no scene commands, avoiding partial changes. Script lookup and timeline commands target the root scene. The editor asks users to return to Scene before opening Actions from a symbol; graphic definitions have no separate script runtime.

Project duration and timeline seek values are frame counts. A 240-frame project at 30 fps is eight seconds. Compatibility with a legacy SWF must eventually be demonstrated against a representative executable corpus, not inferred from similar syntax.

## Export boundary

SVG, HTML, GIF, PNG, MP4 and PDF exports render timeline state. They do not replay arbitrary project scripts or game input while rendering. Browser export capability may vary by OS, codec, resource budget and content. The application must never rename WebM output to MP4.

Symbol validation checks both stored definitions and recursively expanded instances, including unused library definitions. Circular or missing references are rejected before rendering; shared data cannot bypass expansion budgets. A document supports 10,000 stored and expanded keyframes, 20,000 property timing overrides and 10,000 text lines.

3D meshes are capped at 32 objects and 4,096 source triangles. Filters are capped at 64 layers, 16 million scene units squared per layer and 32 million total. Conservative animated bounds reject risky camera/geometry combinations before editing or export. Oversized manipulations roll back the entire gesture. Instance scales conservatively expand descendant filter bounds. Masks never reduce filter bounds. Zero size masks hide content, and older players ignore mask fields. These bounds are resource controls, not a physical-device frame rate guarantee.

## Validation

Run `npm test`, `cargo test`, `npm run test:ui`, `npm run test:symbols`, `RASH_BROWSER=webkit npm run test:symbols` and `node scripts/metaharness-evaluate.mjs` for the affected implementation. Inspect the generated artifacts with independent readers where practical. A release must label untested browsers and unimplemented compatibility explicitly.

`tests/symbols.test.js`, `tests/symbol-render.test.js` and `tests/symbols-browser.mjs` cover the graphic symbol contract at model, renderer/export and visible application boundaries. Their source defines the checks; release evidence must record actual results for the candidate commit.
