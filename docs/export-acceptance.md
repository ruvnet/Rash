# Export acceptance

Rash exports are tested against a small animated scene containing an ellipse, two projected 3D meshes, independent opacity timing, and an animated camera. This establishes representative format acceptance, not complete Flash or ActionScript compatibility.

## What each format contains

| Output | Contents | Limits |
| --- | --- | --- |
| SVG | Animated vector scene with sampled projected 3D geometry | Declarative animation; does not package the ActionScript runtime. Complex scenes may hit the evaluation budget. |
| GIF | Animated raster frames with a fixed RGB332 palette | Maximum edge 640 px; at most 120 sampled frames, targeting 12 fps; maximum clip duration 60 seconds. Transparency is flattened. |
| MP4 | Browser recorded raster animation | Requires MediaRecorder MP4 and canvas capture support. Maximum edge approximately 1920 px, rounded to even dimensions; maximum duration 60 seconds. Recording takes roughly clip duration and can drop frames under load. No audio track is generated. |
| PDF | One page containing a JPEG of frame zero | Raster output, not editable vectors or animation. Maximum raster edge 4096 px. |
| PNG | Frame zero raster | Maximum edge 4096 px. Transparent backgrounds are flattened to white. |
| JSON | Validated editable Rash project | Preserves project data, including keyframes. Not an SWF or FLA file. |
| HTML | Self contained animated SVG presentation | Does not package interactive script execution. Honors reduced motion. |
| JavaScript embed | `rash-player` element loading the hosted runtime | Requires runtime assets and worker access allowed by the host site's CSP and network policy. Supports the implemented script subset, not full ActionScript. |

MP4 capability detection is performed at runtime. Unsupported browsers receive an explicit error; a WebM container is never renamed to MP4. A browser reporting an encoder still needs to successfully encode and decode the result.

## Reproducible acceptance

Install project dependencies and Playwright browser binaries, then run from the repository root:

```sh
npm ci
npx playwright install chromium webkit
node tests/exports-browser.mjs
RASH_BROWSER=webkit node tests/exports-browser.mjs
```

The cross origin worker check also requires the built WASM runtime. Use the repository build workflow if runtime assets are absent. `RASH_TEST_URL` can point to a deployed asset root for published asset acceptance; the temporary test and embedding pages continue to run on separate local origins.

Assertions include:

1. SVG parses as XML and contains sampled 3D animation for an otherwise static mesh under camera motion.
2. GIF is parsed and independently LZW decoded. Six frames cover 50 centiseconds, contain mesh color data, and differ between first and last frame.
3. PDF contains a decodable JPEG with the expected dimensions and projected green mesh pixels. Unit tests separately verify cross reference offsets.
4. PNG contains projected mesh pixels and matches the evaluated initial camera pose.
5. MP4, when supported, loads into a video element, reports expected dimensions and plausible duration, and produces different decoded pixel samples across the clip. Unsupported MP4 must return the documented error.
6. JSON contains the expected objects and motion endpoint; HTML contains declarative animation without external script dependencies.
7. Two embedded players maintain independent frames, retain SVG nodes, play and pause, and honor reduced motion. A separate origin executes the WASM worker and applies mesh commands.

Artifacts are written to `/tmp/rash-export-validation`. The report explicitly distinguishes verified MP4 output from unsupported MP4.

## Evidence and remaining scope

The strengthened suite passed locally in Chromium on 2026-10-13 UTC, including MP4 decoding and motion. Local WebKit could not start because its Playwright binary was absent; a WebKit run in CI or another prepared environment is still required for this revision.

This suite does not prove every template, font, filter, arbitrary scene, audio workflow, physical mobile browser, or third party CSP configuration. Physical iPhone and Android download and sharing acceptance remains separate. An MP4 header alone, or an exported filename alone, is insufficient evidence of a usable output.
