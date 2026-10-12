# Rash compatibility

Rash is a new SVG animation studio with a Rust WebAssembly scripting runtime. It is **not yet a complete Adobe Flash replacement**. Full ActionScript, AVM1, AVM2 and SWF compatibility remain substantial implementation work. Screenshots, an authoring UI and a source interpreter do not establish legacy content compatibility.

This document describes the current source, with precise limits. Release acceptance also requires the automated test and browser evidence for the deployed commit.

| Area | Current implementation | Limit or missing feature |
| --- | --- | --- |
| Stage | Retained SVG rectangles, ellipses, text and paths | No general SVG import, arbitrary filters, masks, bitmap fills or 3D renderer |
| Timeline | Numeric transform keyframes, easing, playback and frame sampling | No Flash shape tween, nested MovieClip timeline or frame event graph |
| Document | Version 1 project JSON; web, social, story, HD, A4 and classic presets | Up to 1,000 nodes; project size and field bounds apply |
| Scripting | Rust source parser and interpreter in a dedicated worker | RashScript subset; not a full ActionScript compiler or AVM |
| Variables | Numbers, strings, booleans, null, declarations and accepted type annotations | Annotations do not implement AS3's type system; no object/class model |
| Control flow | If/else, for, while, break, continue, arithmetic and comparisons | No user functions, classes, packages, imports, exceptions or switch |
| Scene commands | Allowlisted property writes, timeline commands, trace, selected Math functions | No DOM, network, filesystem, eval, dynamic code or Flash API imports |
| Legacy content | Optional self hosted Ruffle 0.7.1 SWF player, isolated from the studio | Upstream AVM1/AVM2 compatibility limits; no FLA import or SWF editing; network, storage and ExternalInterface disabled |
| SVG export | Animated SVG from sampled supported numeric tracks | No project scripts in exported SVG; output size budget applies |
| HTML export | Standalone HTML with animated SVG | Timeline animation only; not a full project runtime |
| JavaScript embed | Custom element using hosted assets | Host CSP, HTTPS/CORS and worker support must allow the asset path |
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

## Language boundary

See [runtime.md](runtime.md) and `crates/rash-runtime/src/lib.rs` for the implemented grammar and command semantics. Strict equality and coercion behavior are deliberately bounded and should not be assumed identical to ECMAScript or AS3. Unsupported features produce errors. Errors return no scene commands, avoiding partial changes.

Project duration and timeline seek values are frame counts. A 240-frame project at 30 fps is eight seconds. Compatibility with a legacy SWF must eventually be demonstrated against a representative executable corpus, not inferred from similar syntax.

## Export boundary

SVG, HTML, GIF, PNG, MP4 and PDF exports render timeline state. They do not replay arbitrary project scripts or game input while rendering. Browser export capability may vary by OS, codec, resource budget and content. The application must never rename WebM output to MP4.

## Validation

Run `npm test`, `cargo test`, `npm run test:ui` and `node scripts/metaharness-evaluate.mjs` for the affected implementation. Inspect the generated artifacts with independent readers where practical. A release must label untested browsers and unimplemented compatibility explicitly.
