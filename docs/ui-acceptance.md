# UI acceptance and capability audit

## What the initial release evidence established

This audit began at commit `674eaa4a1a43e1666f70ccf8cf03d7fc4b4545a2` on 12 October 2026 after a user reported that mobile editing and removal were unavailable. Baseline probes served that commit directly from Git, so concurrent source changes could not affect the findings.

The original 19 UI checks established selected desktop workflows and mobile layout, drawer opening, and tool selection. They did **not** establish mobile text editing, deletion, history, import, export, layer locking, or all advertised workflows. The export browser suite exercised exporter APIs directly; a passing API test did not prove that each export format was reachable through the application.

The baseline mobile probe used Chromium with a 390 × 844 viewport, touch enabled, and the `en-US` locale. Desktop probes used Chromium at 1600 × 1000. These are browser simulations, not physical iPhone or Android acceptance. Real Safari, its virtual keyboard, file sharing, and codec availability need separate evidence.

## Reproduced baseline defects

Priority P1 means authoring access, work loss, or incorrect saved output. P2 means incomplete controls or inconsistent interaction. These are historical findings; the regression suite and release review must establish which have been fixed in the released commit.

| ID | Priority | Reproduction and observed result | Required acceptance |
| :--- | :--- | :--- | :--- |
| UI01 | P1 | At 390 × 844, `.main-menu` and `.command-button` both had `display: none`; there were zero visible Undo controls. File, Edit, and View actions therefore lacked a general touch route. | Without hardware keys, open project, save a backup, undo, redo, and discover help from visible controls. |
| UI02 | P1 | Delete and text fields existed in Properties, but there was no selected object action bar. Selection followed by Properties made Delete usable by touch; a baseline probe removed one of 19 layers. The capability existed but its access was poorly exposed. | Tap an object, discover Edit and Delete, change text and geometry, delete, then undo deletion using touch only. |
| UI03 | P1 | Change X from 50 to 150, Undo to 50, click the same stage object without moving it, then Redo. X remained 50 and the toast said there were no changes to redo. Selection called `checkpoint()`, which cleared redo even when no edit followed. | Selection and canceled gestures preserve redo; a completed mutation clears it. |
| UI04 | P1 | Edit Actions source, close the dialog, wait, then reload. Source existed in memory but reverted to the previously saved source after reload. The test waited for earlier autosave work to finish so a pending timer could not mask the loss. | Close, Escape, and navigation away from Actions preserve source through reload and expose consistent history behavior. |
| UI05 | P1 | Create a 30 fps scene with a key at frame 30, then change to 60 fps. Duration doubled from 60 to 120 frames but keys remained at frames 0 and 30. A key formerly at one second moved to half a second. | Define the FPS conversion contract and test keyframe times, playhead, duration, endpoint rounding, and collisions. |
| UI06 | P1 | Resize a 550 × 400 composition to 1100 × 800 with Scale artwork enabled. A path's metadata width changed from 100 to 200, but SVG `getBBox().width` stayed 100 because its path geometry did not change. | Scaled freehand and curved paths occupy the expected geometry in the editor, saved project, and exports. |
| UI07 | P1 | Play the game in Preview, move right, close Preview. Player X remained 169.4 instead of its authoring value of 110. Game state mutated the authoring document, including collectable visibility. | Closing or stopping preview restores the editable scene; saving and exporting cannot accidentally capture gameplay mutations. |
| UI08 | P2 | Lock a rectangle, then Add keyframe and Toggle fill. A key was added and fill changed to `none`. Dragging, property fields, and Delete already rejected edits, so lock semantics depended on the control used. | Every authoring mutation honors the same lock policy, including keys, easing, rename, arrange, and fill. Duplicate may create an unlocked copy if explicitly defined. |
| UI09 | P2 | Exporter and README supported PNG, but the visible export options were SVG, GIF, MP4, PDF, HTML, and Project only. | Download PNG through the visible export dialog and decode the image independently. |
| UI10 | P2 | Selection corners were drawn with `pointer-events="none"`. They looked like handles but did not resize or rotate the object; dimensions were editable only through inspector inputs. | Provide actual gestures or clearly treat the corners as selection decoration. Do not claim direct transform gestures without a touch and pointer test. |
| UI11 | P2 | The New composition dialog said the current project was saved, while a single browser storage key was replaced after creation. Undo could recover it only during the current session. | Explain the replacement and offer a backup; do not imply a persistent project library unless one exists. |

Additional integration gaps at the baseline were missing embedded collector game controls and editor script application omitting `fontSize`, `strokeWidth`, and `stroke`. Both implementations have now been corrected. The game has an executable regression suite; the script command allowlists were checked in source during the diff review.

## Followup implementation and measured coverage

The v0.1.1 candidate passed 28 Chromium mobile workflow checks, twelve Chromium workflow regression checks, the original 19 UI checks, 35 JavaScript unit tests, and the export and embedded game suites during integration. These counts describe the named checks in the repository; they are not a percentage of original Flash requirements. Publication and browser evidence for the deployed revision remain separate gates.

| Finding | Candidate implementation | Evidence and explicit limit |
| :--- | :--- | :--- |
| UI01 and UI02 | Visible selection Edit, Duplicate and Delete actions, persistent touch history controls, a More menu, larger drawers, and text editing dialog | `tests/mobile-browser.mjs` exercises touch creation, editing, rename, deletion, undo, redo, open, save, help and export in portrait and landscape. |
| UI03 | History starts when a movement exceeds the gesture threshold, rather than on initial selection | The touch selection after undo check preserves redo. A pointer cancellation after an actual movement currently keeps that edit and can be undone; it is not a rollback gesture. |
| UI04 | Closing or switching away from Actions saves the draft through normal project history and autosave | Both mobile and workflow tests wait for the earlier save timer to settle, close without running, reload, and assert source persistence. |
| UI05 | FPS conversion scales duration, playhead, and keyframe indices together | Workflow suite checks 30 to 60 to 24 fps, repeated control values, retimed keyframe buttons, focus preservation, and one undo entry per typing session. Downsampling can merge keys at one frame and is not lossless; this case has no separate behavioral acceptance in this release. |
| UI06 | Paths retain source geometry dimensions and apply explicit width and height scaling in rendering and SVG output | Workflow suite measures actual path geometry after inspector and composition resize. Animated path export is covered by source review and existing export checks, not a comprehensive curve corpus. |
| UI07 | Editor playback preserves an authoring snapshot, restores it when stopped, and saves that snapshot while playing | Workflow suite moves the game player and checks the complete project is restored on preview close. |
| UI08 | Consistent guards reject editing locked layers; inspector mutators are disabled with a visible unlock action | Mobile suite checks blocked movement, property changes and deletion. Source review confirms keyframe, easing, rename, ordering and fill guards. Visibility remains an available layer control and duplication makes an unlocked copy. |
| UI09 | PNG is a visible export option | Mobile suite downloads every visible image, document and source format and checks actual output signatures; MP4 must produce a real MP4 container or an explicit capability error. |
| UI10 | Rectangle, ellipse and text selection corners now have pointer and touch resize handling | Mobile suite performs an actual corner drag. Independent review resized a rectangle at 37 degrees and scale 1.4; the opposite anchor stayed within 0.05 scene units. Text corners change uniform scale. Paths use inspector dimensions; rotation remains an inspector field, not a rotation handle. |
| UI11 | New composition explains single project storage, offers a current project download, and asks before replacing existing work | Mobile suite checks wizard cancellation preserves work. This is still one current autosave, not a cloud or multi project library. |
| Embedded game | Player uses a separate game scene and binds keyboard and touch movement, pause and restart | `tests/embed-game-browser.mjs` checks movement, pause, restart, independent instances, immutable source and no browser errors. Media exports remain timeline snapshots and do not replay game input. |

The final diff review also identified and corrected multiline text DOM amplification. A 3,935,161 byte project with 400 text nodes could expand into 1,960,400 SVG text spans. Validation now rejects more than 256 lines per text layer or 10,000 aggregate text lines. The adversarial import and aggregate limit regression tests pass; the hostile scene was never rendered. A workflow test verifies that a rejected multiline edit leaves the valid scene unchanged and displays an error. Editor and embed scripts stage changes on a separate candidate, validate the complete scene, then execute timeline controls. An actual WASM regression sets oversized text and calls `gotoAndStop`; a DOM observer confirms no rejected text expansion is rendered. Independent final review reran all eleven workflow checks successfully.

The WebKit release gate exposed change events that did not fire when a touch left a numeric field focused. Inspector edits now commit on input while retaining the active control and grouping its edits into one undo entry. Independent review then reproduced stale FPS, frame and easing controls after programmatic updates. A shared control synchronization path and regression cover those values and retimed keyframe buttons. Game acceptance waits for observed movement rather than assuming a fixed rendering delay.

## Capability matrix

“Implemented” below describes the bounded product, not full Flash parity. A module test, an application workflow test, and a deployed browser test are distinct evidence.

| Workflow | Implemented scope | Evidence and remaining boundary |
| :--- | :--- | :--- |
| New composition | Six templates, size presets, name, frame rate, replacement notice and backup download | Desktop and mobile wizard coverage. No multi project browser library. |
| Drawing | Rectangle, ellipse, text, freehand path, selection and drag | Desktop drawing and real Chromium touch drag covered. Not every possible path gesture or physical device is tested. |
| Text and appearance | Multiline text, font size and weight, fill, stroke, opacity, corners | Touch text editing and numeric properties covered. SVG, image and document export paths are exercised; exact font metrics vary by device. |
| Transform | Position, size, rotation, scale, alignment, stacking; corner resizing for rectangles, ellipses and text | Touch corner drag, numeric edits and path resize covered. Path dimensions and rotation use inspector controls. |
| Layer operations | Select, rename, hide, lock, duplicate, delete, reorder | Touch suite changes actual project data and rendered visibility, then exercises undo and redo. |
| History | Project snapshots for undo and redo, bounded memory | Mutation history and selection preserving redo covered. History is not a persistent project archive. |
| Timeline | Numeric keys, easing, scrub, loop, playback, exact frame input, key deletion, FPS conversion | Mobile key creation, edits, seeking and removal covered. No nested symbols, shape tweening, clip trimming, or frame event graph. |
| Script authoring | Bounded RashScript in a real Rust WASM worker | Actual worker, bounded failure, touch execution and source persistence covered. Full ActionScript is unsupported. |
| Preview | SVG timeline and collector game preview | Game close restores the authoring project. Embedded game has a separate acceptance suite; media exports do not execute game input. |
| Local persistence | One autosaved composition plus JSON backup and import | Desktop hostile import and mobile file download, actual file chooser import, and reload covered. No accounts, cloud sync or collaboration. |
| SVG export | Animated vectors from supported numeric tracks | UI download and XML parsing covered. Scene scripts and game input are not replayed. |
| GIF export | Actual GIF encoder, bounded sampled animation | API, independent decoder and visible mobile export path covered. Physical device memory limits remain unmeasured. No audio. |
| PNG export | Static frame zero image | API and visible mobile PNG download covered. |
| PDF export | Static raster frame in a PDF container | API, independent decoder and visible mobile download covered. Not vector, animated, or editable artwork. |
| MP4 export | Actual browser MP4 recording when supported | API and touch UI require valid MP4 or explicit unsupported output. Codec and frame cadence depend on the browser. No audio. |
| HTML export | Standalone animated SVG timeline document | API and visible mobile download covered. It does not execute arbitrary scene scripts or game input. |
| Project export | Editable JSON containing scene, keys, and script | Model round trip, touch download, and actual file chooser import covered. |
| JavaScript embed | Independent SVG custom elements, controls, initialization script, collector game input | Same and cross origin worker tests and independent game suite covered. Host CSP and CORS apply. It is not a general Flash game runtime. |
| Help and menus | Keyboard and touch help, resources, project details, command palette, mobile More menu | Desktop dialogs and touch navigation to help, Actions, resources and embed code covered. |
| `rash://` resources | Allowlisted local project, node, template, help addresses | Resource tests and desktop resolution covered. It is not a network protocol or remote persistence layer. |
| Template search | Real optional RuVector WASM cosine search | Tests cover the real module and explicit fallback. Vectors are deterministic lexical features, not learned semantic embeddings. |
| Legacy SWF | Optional isolated Ruffle player | Sample playback and host isolation probes covered. No SWF editing, FLA import, or universal ActionScript compatibility. |
| Claude package | Passive manifests and authoring and verification skills | Repository validation only. A real Claude host installation has not been established by editor tests. |
| MetaHarness | Static scorecard and measured checks | No demonstrated autonomous improvement or self learning. |

## Release acceptance

Run `npm test`, `cargo test --locked`, `npm run test:ui`, `npm run test:mobile`, `npm run test:workflows`, `RASH_BROWSER=webkit npm run test:workflows`, `npm run test:embed-game`, `npm run test:exports`, and `npm run test:runtime` for the exact release revision. Record each new workflow assertion by name and repeat affected UI paths against the deployed URL. Desktop passing does not substitute for touch acceptance.

The core mobile acceptance sequence is: create a blank composition, add and select text, edit it, change geometry and color, duplicate, lock and attempt edits, unlock, delete, undo and redo, add and remove a keyframe, save and reopen a project, and export through visible controls. No hardware keyboard, direct calls into application action handlers, or injected DOM events may substitute for the relevant gestures. Reading diagnostics for assertions is acceptable.

Full ActionScript, AVM compatibility, FLA editing, arbitrary SVG and media import, nested timelines, Stage3D, a general game engine, audio and video composition, and collaborative cloud persistence remain separate implementation work. Their absence must not be described as completed end to end functionality. Track the broader scope in [issue 2](https://github.com/ruvnet/Rash/issues/2) and the [compatibility matrix](compatibility.md).
