# Rash 0.5.0 release acceptance

## Delivered behavior

Reusable graphic symbols replace duplicated source with shared definitions. Convert a selected animated layer, place instances through Library, edit the definition on its own stage and timeline, and nest definitions. Every reference updates together. Instances have loop, once and single frame playback, first frame and parent start offsets, ordinary transforms, opacity, blend modes and explicit geometric masks. Definitions retain their own dimensions, camera and duration while inheriting document FPS.

History records the complete root document and editing scope. Saving, local autosave, JSON download, import, embed and export retain every definition while a nested scope is open. Visible phone controls support conversion, editing, nesting, return to Scene, deletion and Undo. A referenced definition cannot be deleted until its instances are removed. Duplicate and paste preserve shared identity.

The model, retained SVG renderer, still SVG and animated exporter share deterministic local clock semantics. Each renderer namespaces full instance paths, so repeated masks and effects remain independent. `rash://symbol/ID` resolves a cloned local definition without gaining network authority.

Version 1 projects retain their schema and byte identical gallery SVG output. Creating symbols upgrades a document to version 2. Older players reject version 2 explicitly. There are no dependency upgrades, new network services, credentials or Rust language changes.

## Verification

Local verification passed 129 JavaScript tests and 10 Chromium symbol acceptance checks. The existing desktop, mobile and workflow suites passed 19, 28 and 12 checks. An independent review additionally exercised duplicate/paste, identity, undo, scope restoration, unsafe imports and graph budgets. Counts overlap and must not be added as independent coverage.

The symbol browser suite performs conversion through visible controls, verifies authored geometry, places and duplicates instances, edits shared artwork and duration, configures instance clocks, nests definitions, rejects cycles, downloads and reloads the full root document, protects referenced definitions, and repeats editing and deletion by touch. It also compares live, still and animated SVG geometry at four parent frames and mounts two players on a different origin to test separate clocks, namespaces and definition state. Malformed imports leave the active project unchanged.

Animated SVG samples are checked 100 microseconds inside their authored frame. Chromium's SMIL seek clock can truncate a rational boundary by about one microsecond. Sampling inside the frame avoids measuring the preceding frame; it does not shift exported key times. A unit test verifies full precision v2 key time ratios. The minimum supported frame duration is 8.33 milliseconds.

The Pages workflow requires the symbol suite in Chromium and WebKit, all existing editor, mobile, motion, camera, mask, export, embed, rollback and runtime gates, Rust tests, a WASM rebuild and the static build. PR and deployment receipts record the final tested commit and public acceptance. This document is not itself evidence of deployment.

## Measured tradeoffs

The [reproducible benchmark](evidence/symbol-benchmark.md) compares 100 placements of a five layer animated motif with 500 flattened layers. Its [source and fixture hashed receipt](evidence/symbol-benchmark.json) records the environment and samples. Run `npm run bench:symbols` to repeat it.

Shared source reduces formatted project JSON from 593,343 to 89,341 bytes, a reduction of 84.94%. Median validation falls from 1.573 to 0.183 ms. Median traversal rises from 0.897 to 0.935 ms, or 4.27%, while traversing 600 nodes including containers instead of 500. Every leaf's evaluated transform, size and opacity agrees across all 240 frames.

These are CPU model measurements for one repeated motif. They exclude DOM updates, paint, editor panels, export, encoders and physical mobile hardware. Reuse reduces authoring storage; rendering still pays for expanded content.

## Security and limitations

Graph validation bounds 128 definitions, depth eight, 1,000 stored and expanded nodes and 10,000 expanded keys, together with existing text, mesh and effect limits. Repeated instances and unused definition branches consume budgets. Cycles, unknown references and duplicate IDs reject before rendering. Descendant effect envelopes include cumulative instance scaling. Container blur and glow reject until descendant allocation bounds are implemented; artwork inside a symbol can still use those effects. Export work and 16 MB output limits charge expanded content.

Graphic clocks are derived from their parent. Independent MovieClip clocks, frame scripts, button states, display object lifecycle events and complete AS1/AS2/AS3 semantics are not implemented by this release. Root scripting does not acquire access to nested children. Full Flash compatibility, FLA/SWF editing, Stage3D and synchronized media remain on the [parity plan](flash-parity.md).

[ADR 009](adr/009-symbols-and-nested-timelines.md) records the contract. Rollback is a revert and Pages redeploy. Preserve downloaded version 2 documents before rollback; do not relabel them as version 1.
