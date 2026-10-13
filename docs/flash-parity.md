# Complete Flash in SVG: acceptance plan

The product target is a complete Flash style authoring environment and compatible content runtime, backed by SVG, Rust and WebAssembly. The current release is a partial implementation. A complete claim requires evidence across authoring, language semantics, display behavior, multimedia, file compatibility and deployment.

The reference baseline is classic Flash Professional authoring and published AS1, AS2 and AS3 content. Browser restrictions must appear as explicit deviations, not disappear from the scorecard. Later Animate features and AIR operating system APIs need their own versioned profiles. No percentage of Flash compatibility is claimed without a defined corpus and denominator.

## Delivery order

| Milestone | User outcome | Current position | Required acceptance |
| :--- | :--- | :--- | :--- |
| 1. Symbols and composition graph | Build reusable animated artwork and edit all instances together | Shared graphic symbols and nested timelines implemented in v0.5.0 | Convert, instantiate, nest, edit, delete, undo, reload, export and embed in Chromium/WebKit on desktop and phone |
| 2. Classic timeline authoring | Animate drawings, poses and scenes with Flash frame operations | Property and discrete blank/exposed keyframes plus insertion/removal/copy exist; frame labels and multiple scenes missing | Onion skin, shape tween, motion path, frame labels and scene navigation fixtures |
| 3. Vector and asset authoring | Create and import real production artwork | Shapes, text and freehand exist; full point editing, gradients, bitmaps and asset management missing | Pen handles, contour editing, fill/stroke rules, bitmap decode limits, font fallback, group transforms and import roundtrips |
| 4. Interactive display objects | Build buttons, nested MovieClips and reusable game behaviors | One collector demo and bounded scene commands | Independent clip clocks, display list lifecycle, hit testing, event propagation, four button states, frame scripts and deterministic replay |
| 5. ActionScript language and APIs | Run source with defined AS1/AS2/AS3 semantics | Native Rust interpreter implements a small documented subset | Versioned syntax, coercion, class/function, object, collection, exception and Flash API fixtures; exact logs and state transitions |
| 6. Legacy file compatibility | Open, play and eventually edit existing Flash content | Optional isolated Ruffle player; no FLA import or native SWF editing | Licensed SWF corpus with exact hashes, import diagnostics, reference outputs, malformed file limits and conversion roundtrip tests |
| 7. Multimedia and publishing | Synchronize sound/video and publish complete experiences | Timeline SVG/HTML/GIF plus raster stills and browser MP4 | Audio scheduling, codec handling, capture synchronization, vector PDF, deterministic video muxing and scripted replay policy |
| 8. Production workspace | Work reliably across devices and large projects | Local autosave, JSON backups, responsive UI and browser tests | Real device tests, crash recovery, bounded large scene latency, accessible controls and reproducible restore; tenant storage only with tested isolation |

Milestones 2 and 3 can proceed independently once the composition contract is stable. Milestones 4 and 5 share display object identity and scheduling; implement them against one conformance corpus. Legacy playback and native authoring remain separate paths until import and runtime adapters have evidence.

## What SVG can and cannot establish

SVG provides crisp retained vector geometry, clipping, filters, text and hierarchical transforms. It is a rendering target. Matching an animation visually does not prove ActionScript semantics, MovieClip lifecycle, audio timing or SWF compatibility.

The Rust runtime must own script semantics and budgets. Worker boundaries protect responsiveness, but require instruction, recursion, memory and output limits as well. The optional legacy player has its own compatibility and resource boundaries. [Ruffle's compatibility page](https://ruffle.rs/compatibility) describes upstream support; those upstream claims are not Rash's own test results.

## Conformance corpus rules

Each fixture records its source license, immutable input hash, language/runtime profile, expected logs, frame/event order, display state and screenshot tolerances where appropriate. Separate authored Rash projects, imported legacy fixtures and deliberately hostile inputs. A fixture that merely opens is not a playback pass.

Every run records commit, toolchain, browser/OS, fixture version, expected and observed outputs, duration and peak resource measurements where available. Keep regression fixtures public when their licenses allow it. Never download proprietary Flash applications into the repository merely to increase corpus size.

Unsupported, failed, skipped and passed are distinct outcomes. No silent fallback from ActionScript to JavaScript evaluation. No renaming a media container. No hidden disappearance of unsupported objects during import. A reference oracle must have lawful provenance and a documented version.

## Completion rule

The tracking issue is [Flash compatibility roadmap #2](https://github.com/ruvnet/Rash/issues/2). Closing it requires every agreed baseline feature to map to executable evidence, with platform deviations explicitly approved. The [compatibility matrix](compatibility.md) describes what exists today; this plan describes the target.

The immediate executable acceptance scenario is: create one animated symbol, place two instances, nest another symbol, change the definition on a phone, save/reload, and compare the exported SVG and embedded players at the same frame. That closes the first structural gap; it does not certify full Flash compatibility.
