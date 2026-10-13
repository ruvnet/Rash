# Embed Rash on a website

Rash publishes a browser module and a custom element. Projects contain declarative scene data; the player creates SVG elements through DOM APIs and runs supported scripts inside the bounded Rust WASM worker. Multiple players have independent state.

```html
<script type="module" src="https://ruvnet.github.io/Rash/embed.js"></script>
<rash-player
  src="https://example.com/artwork.rash.json"
  controls autoplay loop
  style="display:block;width:100%;max-width:1280px;aspect-ratio:16/9">
</rash-player>
```

The project URL must use HTTPS, or the same HTTP origin for local development. Cross-origin project servers must permit CORS. Requests omit credentials and reject redirects. Import size is bounded at 5 MB.

For self-contained scene data, use the studio's **Embed** option. It produces a module script plus an inline `application/json` child with HTML-sensitive characters escaped. Use the generator instead of interpolating user-authored text into a script tag:

```js
import { embedCode } from './export/export.js';
const snippet = embedCode(project, {
  baseURL: 'https://ruvnet.github.io/Rash/'
});
```

## Player controls

| Interface | Behavior |
| --- | --- |
| `controls` | Shows accessible play/pause, timeline and time controls |
| `autoplay` | Starts playback unless reduced motion is requested or the script calls `stop()` |
| `loop` | Repeats the timeline |
| `src` | Loads a validated project from a URL |
| `player.project = project` | Replaces the scene with a validated copy |
| `player.play()` / `player.pause()` | Controls playback |
| `player.seek(frame)` | Seeks to a clamped integer frame |
| `player.currentFrame` | Returns the current zero-based frame |
| `rash-load` | Announces validated project readiness |
| `rash-script` | Contains script trace logs after initialization |
| `rash-warning` | Reports unavailable or unsupported scripting |
| `rash-error` | Reports loading or validation failures |
| `rash-ended` | Fires when playback finishes without looping |

Native node animation uses retained SVG elements. Only changed attributes are written. Autoplay respects `prefers-reduced-motion`; a user can still choose Play explicitly. Disconnecting the element stops animation, aborts fetches, and disposes its worker.

Scripts execute once when the project is initialized. The implemented ActionScript-inspired subset can initialize scene properties and issue play, stop and goto commands. This release is **not full ActionScript or SWF compatibility**, and it does not support general enter-frame handlers. See the runtime compatibility documentation before importing legacy code.

## Shared symbols in embeds

A version 2 project carries its entire `symbols` library alongside the root `nodes`. A symbol instance references a definition by `symbolId`; the player renders its children as retained SVG groups. Separate player elements receive validated copies, so their playheads and definition state do not affect each other.

The instance playback values are `loop`, `once` and `single`. `firstFrame` chooses the initial symbol frame; `startFrame` anchors the instance clock to its parent. Both values are zero based in JSON. The first frame holds before the start, and nested symbols evaluate from their immediate parent's frame. A single frame instance still permits its outer transform to animate on the parent timeline. Every scope uses the project's FPS.

A definition can contain vectors, text, projected 3D layers, their effects, geometric masks and other symbol instances. Each definition owns its camera and duration. Container opacity, transform, geometric masks and blending are supported; apply blur/glow to layers inside the definition. MovieClip mode advances on an independent player transport across root loops and freezes with player pause. Per-clip play/stop, symbol scripts, lifecycle events and Button symbol states are not implemented.

Use the studio's generated embed snippet or pass the complete validated document to `player.project`. Saving or exporting from inside the symbol editor still includes the root scene and the complete library. `rash://symbol/<id>` addresses a local definition in the editor's resource registry; it is not an asset URL or a remote loader.

**Version 2 needs the current player bundle.** Version 1 projects remain supported, but older player versions reject version 2. Deploy `embed.js` with its matching `core/`, `runtime/` and other build assets instead of mixing files from different releases. Exported SVG and HTML contain their own visual timeline and do not require the Rash module to play it.

## Iframe player

```html
<iframe
  title="Interactive Rash artwork"
  src="https://ruvnet.github.io/Rash/player.html?src=https%3A%2F%2Fexample.com%2Fartwork.rash.json"
  style="border:0;width:100%;aspect-ratio:16/9"
  allow="fullscreen">
</iframe>
```

The iframe avoids host-page style collisions. Its optional `postMessage` project interface accepts only messages from the parent with the same origin as the player. Cross-origin embeds should use `src` or the custom element.

## Export API

```js
import { exportProject } from './export/export.js';
const { blob, filename } = await exportProject(project, 'gif', {
  onProgress: fraction => console.log(Math.round(fraction * 100))
});
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = filename;
link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

| Format | Actual output | Limits |
| --- | --- | --- |
| JSON / Rash | Normalized project data, including script and complete symbol library | Intended for full editable round trips |
| SVG | Portable SVG with native SMIL timeline animation and nested symbol clocks | Frame-stepped at project FPS; geometry and text remain vector |
| HTML | Self-contained animated SVG document | Honors reduced motion; no runtime asset requests |
| PNG | Static first-frame image | Up to 4096 px per dimension |
| GIF | GIF89a, RGB332 256-color palette, LZW compression, looping | At most 640 px longest edge, 120 frames, 12 FPS, 60 seconds |
| PDF | One-page PDF 1.4 containing a high-quality first-frame JPEG | Raster page; 96 CSS pixels map to 72 PDF points |
| MP4 | Real MP4 container produced by browser MediaRecorder | Requires browser MP4 support; at most 1920 px longest edge and 60 seconds; codec chosen by browser |

SVG and HTML encode scene and nested symbol keyframes without running ActionScript. Shared editing identity remains in JSON and module embeds; a portable SVG export contains each rendered instance and does not serve as an editable Rash project. PNG and PDF capture frame zero. GIF and MP4 export visual keyframes without audio or script execution. Use the module player for supported scripted initialization. Game mechanics supplied by the studio are not compiled into a standalone SVG, GIF, PDF or MP4.

GIF reduces sampling frequency for timelines longer than ten seconds while preserving total duration to centisecond precision. GIF transparency is composited on white. Exporting large clips has an unavoidable CPU and memory cost; frames are encoded incrementally rather than retained as raw full-frame buffers.

MP4 recording runs in real time. Keep the tab visible during export. A half-second clip should take approximately half a second plus rasterization and encoding overhead. The codec may be VP9 inside MP4 rather than H.264, depending on browser support. Unsupported browsers report an actionable error; Rash never labels WebM data as MP4. `mp4Support()` exposes the capability check before export.

SVG exports reject scenes exceeding 500,000 animated layer-frames, five million estimated keyframe evaluation operations, 200,000 animated source triangle frames, or a conservative 16 MB serialized-output estimate. Symbol exports budget the expanded instances, sample their local clocks on the root timeline and verify final serialized size. These bounds prevent crafted timelines from monopolizing the UI thread.

## Content security policy and deployment

Host the complete `web/` build, including `core/`, `runtime/`, `runtime/pkg/`, `embed.js` and `export/`. The Pages deployment preserves these relative paths. WASM must be served as `application/wasm`.

For a third-party module embed, your CSP must permit the chosen Rash host for scripts and asset connections. Cross-origin WASM workers use a same-origin Blob wrapper which imports the public worker module using CORS. That requires `worker-src blob:` and an appropriate `script-src` containing the Rash host and `'wasm-unsafe-eval'`. Hosts with tighter policies can self-host the same static files or use the iframe player. The runtime does not use JavaScript `eval` or `new Function`.

Only validated primitive and graphic symbol scene types are accepted. Symbol references resolve inside the same validated project; they cannot request external definitions. Circular references and excessive graph expansion are rejected before rendering. Fill and stroke values are sanitized, paths are restricted to SVG path syntax, text uses `textContent`, project URLs exclude credentials and unsafe schemes, and dynamic project data never enters an HTML template.

## Reproducible checks

```sh
node --test tests/exports.test.js
node tests/exports-browser.mjs
node tests/symbols-browser.mjs
RASH_BROWSER=webkit node tests/symbols-browser.mjs
```

The browser suite requires Playwright with Chromium and starts temporary local servers itself. It checks player independence, retained DOM nodes, play/pause, reduced motion, parseable SVG, generated file signatures, and Rust WASM scripting from a different origin. When supported, it records an actual MP4. Output artifacts are written to `/tmp/rash-export-validation` for optional inspection with GIF, PDF and video decoders.

`tests/symbols-browser.mjs` compares nested live, still SVG and animated SVG geometry at several root frames, checks mask ID isolation and verifies independent players across origins. It also checks whole project downloads while editing a definition and rejects malformed cyclic imports without replacing the current project. These checks require an actual successful run against the chosen source or deployed revision; source coverage alone is not release acceptance.
