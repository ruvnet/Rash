# Rash scripting and legacy compatibility

Rash ships two distinct Rust/WebAssembly execution paths. Neither is advertised as full ActionScript compatibility.

1. The SVG studio runs a small, deterministic ActionScript-style interpreter implemented in this repository. It emits validated scene commands from a dedicated worker.
2. `legacy.html` optionally loads pinned Ruffle 0.7.1 for existing SWF archives. Ruffle provides broader AVM1/AVM2 support in its own player. SWF scenes are not converted to Rash SVG scenes.

## Studio scripting API

```js
import { createRuntime } from './runtime/client.js';
const runtime = await createRuntime();
const result = await runtime.run(`
  var clip:MovieClip = getNode("hero");
  for (var i:int = 0; i < 10; i++) {
    clip.x += 3;
  }
  clip.alpha = 0.8;
  trace("moved", clip.x);
  gotoAndStop(24);
`, {
  frame: 0, fps: 30, width: 1280, height: 720,
  nodes: [{ id: 'hero', name: 'hero', x: 20, y: 20, opacity: 1 }]
});
console.log(result); // { logs, commands, steps, error? }
runtime.dispose();
```

`run()` executes once with fresh variables. It never automatically executes a source script on every animation frame. The host applies the emitted commands after success; a failed script returns an empty command list. The host must validate the resulting document before committing edits.

| Command | Fields | Meaning |
| :--- | :--- | :--- |
| `set` | `id`, `property`, `value` | Update an allowed node property |
| `play` | None | Play host timeline |
| `stop` | None | Pause host timeline |
| `goto` | `frame`, `play` | Seek host timeline and choose playback state |

For scripts loaded from cross origin embeds, the client creates a small blob worker entry that imports the public worker module with CORS. The embedding site's Content Security Policy must permit the player origin, WebAssembly compilation, and `worker-src blob:`. A blocking CSP produces an explicit error; the runtime does not bypass browser restrictions or substitute JavaScript eval.

## Native interpreter compatibility

| Feature | Support and limits |
| :--- | :--- |
| Numbers, booleans, strings, null | Implemented; nonfinite numeric results rejected |
| `var`, `let`, `const` declarations | Implemented in one invocation scope; `const` does not enforce immutability |
| Type annotations | Recognizes Number, int, uint, String, Boolean, Object, MovieClip, Sprite; informational only |
| Arithmetic, comparison, boolean operators | Implemented with precedence and short circuit evaluation |
| `==` and `===` | Both use strict value equality; legacy loose coercion is not reproduced |
| Assignment and compound assignment | Implemented; variables must be declared first |
| Postfix `++`, `--` | Implemented; prefix updates unsupported |
| `if`, `else`, `for`, `while` | Implemented with break and continue |
| Ternary expressions | Implemented |
| `trace()` | Implemented with bounded output |
| `play`, `stop`, `gotoAndPlay`, `gotoAndStop` | Emit host commands; frame numbers follow Rash's frame convention, not legacy Flash's guaranteed 1-based convention |
| Node lookup | Identifier matching name or ID, `this.name`, `_root.name`, `getNode("id")` |
| Editable properties | x, y, width, height, rotation, rotationX, rotationY, z, opacity, uniform scale, visible, fill, stroke, strokeWidth, fontSize, text, primitive, wireframe, blur, glow, blendMode |
| AS2 aliases | `_x`, `_y`, `_width`, `_height`, `_rotation`, `_alpha`, `_visible`; `_alpha` uses 0 to 100 |
| AS3 aliases | `alpha` maps to opacity |
| `scaleX`, `scaleY` | Explicitly rejected until directional scale exists throughout renderer and player |
| `Math` | PI, E, sin, cos, tan, abs, sqrt, floor, ceil, round, min, max, pow, atan2 |
| Explicit Number/String/Boolean/int/uint casts | Implemented; int/uint wrap to 32 bits |
| Classes, functions, packages, imports, inheritance | Unsupported and rejected |
| Arrays, objects, closures, exceptions, events, display-list construction | Unsupported |
| AS1/AS2/AS3 bytecode and SWF parsing | Not implemented in the SVG scripting engine; use separate Ruffle legacy player |
| Flash multimedia APIs, networking, filesystem, ExternalInterface | Not exposed |

The scene validator additionally bounds 3D geometry, camera and filter allocation after successful script execution. Primitive names, blend modes, colors and booleans use explicit allowlists. A scene validation failure discards every emitted edit. Camera properties are not exposed through node commands.

This matrix is a capability contract, not a claim of ActionScript language conformance. Full compatibility requires an AVM implementation, Flash API coverage, display-list semantics and a large versioned content corpus. The optional Ruffle path supplies an established Rust implementation for that different use case.

## Runtime budgets and trust boundaries

The Rust module has no host imports. Scene operations are returned as JSON, not executed as browser code. The worker isolates execution from the UI; scripts cannot access DOM, fetch, storage, or global JavaScript. Parser and VM depth budgets also cover flat operator trees. SVG fill values are restricted to hex colors and a small named-color set; `url(...)` values are rejected.

| Budget | Limit |
| :--- | :--- |
| Source | 64 KiB |
| Request including scene context | 2 MiB |
| Context nodes | 4096 |
| Tokens | 32768 |
| AST and evaluation nesting | 96 |
| Interpreter operations | 50000 |
| Individual strings | 16 KiB |
| Output commands or log entries | 4096 each |
| Combined output payload | Approximately 1 MiB |
| WASM linear memory | 64 MiB maximum |
| Default wall clock | 2000 ms, then worker disposal |
| Pending invocations | 8 |

A terminated worker must be recreated with `createRuntime()`. Interpreter errors keep diagnostic logs but discard all scene commands. Budget termination is deterministic for the operation count; the separate wall clock deadline varies with device load.

## Legacy SWF player isolation

`legacy.html` accepts local SWF bytes only, up to 20 MiB compressed and declared uncompressed size. It contains no remote movie URL field. The included original SWF smoke sample only paints an orange background and has no script or third-party content.

The player runs in an iframe with `sandbox="allow-scripts"`, without `allow-same-origin`, popup, form, download, or top-navigation permissions. The resulting opaque origin cannot use persistent storage. Its CSP has `connect-src 'none'`, and permits only the pinned player script assets. It cannot retrieve remote images, fonts, or media.

Ruffle's own configuration disables ExternalInterface (`allowScriptAccess: false`), external links (`openUrlMode: 'deny'`), and requests networking mode `none`. **The official Ruffle documentation says networking mode `none` is not implemented yet, so this flag is not the security boundary.** A non-overridable `fetch` replacement accepts only the exact two pinned WASM asset URLs, with GET and no query or fragment. The parent page brokers those public asset bytes to the iframe. All other fetches are rejected, and CSP separately blocks XHR, WebSockets, and other direct connections. No SWF file bytes leave the browser.

The engine is loaded only when the user opens a legacy movie. Each WASM variant is approximately 14 MB uncompressed; typically one variant is downloaded, plus JavaScript. That cost is isolated from normal SVG editing and embeds.

A one-second script execution configuration limits individual legacy scripts. This is not a hard browser memory limit: a malformed or complex SWF could still exhaust memory or trigger an upstream decoder bug. Close Movie removes the entire iframe document. Production handling of hostile archives should use a dedicated hosting origin and a separately audited content corpus. Ruffle compatibility does not guarantee Flash API completeness.

Official sources, verified 2026-10-12:

* [Ruffle compatibility](https://ruffle.rs/compatibility)
* [Ruffle load options and ExternalInterface control](https://ruffle.rs/js-docs/master/interfaces/Config.BaseLoadOptions.html)
* [NetworkingAccessMode, including the unimplemented none warning](https://ruffle.rs/js-docs/master/enums/Config.NetworkingAccessMode.html)
* [External URL deny mode](https://ruffle.rs/js-docs/master/enums/Config.OpenURLMode.html)
* [Selfhosted upstream source](https://github.com/ruffle-rs/ruffle/tree/master/web/packages/selfhosted)

## Build and verification

```sh
cargo test --workspace
cargo clippy --workspace -- -D warnings
sh scripts/build-wasm.sh
node web/runtime/verify.mjs
node tests/runtime-browser.mjs
```

The committed `web/runtime/pkg/rash_runtime.wasm` is built from this repository and verified through its actual WebAssembly ABI. The build script pins dependencies through Cargo.lock and sets a 64 MiB maximum linear memory. No wasm-bindgen CLI or generated JavaScript is required.

The native suite has 20 tests including control flow, scene commands, transaction rollback, injection rejection, deep/flat expression rejection, output limits, integer conversion, and 1000 deterministic malformed-source inputs. The WASM smoke suite checks the same command contract and executes 120 benchmark runs. Initial local Node measurements for 200 emitted commands were approximately 0.6 ms median and 1.2 ms p95, with a roughly 222 KB module. These are interpreter microbenchmarks, not browser rendering FPS or mobile latency claims.

Browser acceptance: open the studio, run a script that changes a selected node, verify one undo reverses it, then run an infinite loop and verify the UI remains responsive with no applied commands. Open `legacy.html`, load the built-in movie, verify its orange stage, verify direct fetch and storage access fail inside the frame, then close the movie and confirm the player is removed.

Browser verification completed with Chromium: native worker commands, instruction-budget abort, cross-origin blob worker, actual Ruffle WASM sample playback, generated AVM1 ActionPush/ActionSetProperty pixel displacement (x=0 to x=80), opaque-origin parent isolation, rejected external fetch, blocked localStorage, invalid SWF rejection, and iframe disposal all passed. The browser test sets locale `en-US` because this container reports the nonstandard `en-US@posix`, which upstream Ruffle rejects via Intl.Locale.
