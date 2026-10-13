# ADR 009: Shared symbols and nested graphic timelines

Status: Accepted. Implemented in v0.5.0; see [release acceptance](../release-0.5.0.md).

## Outcome

Rash must support authoring a reusable animated element once, placing several instances, editing its definition, and seeing all instances update. The same project must behave consistently in the editor, a portable player, still exports and animated SVG. This is the first structural milestone toward the complete Flash target in [the parity plan](../flash-parity.md).

The prior model stores only a flat array of layers. Copying a layer duplicates its source and cannot represent a reusable character, nested composition or library item. More visual effects do not repair that limitation.

## Semantics and boundaries

This milestone implements graphic symbols whose local timelines are derived deterministically from their containing timeline. Adobe distinguishes these from MovieClip symbols with independently running timelines. See the [Adobe symbol reference](https://helpx.adobe.com/animate/desktop/multimedia-and-video/symbols.html).

Independent MovieClip clocks, frame scripts, button states and ActionScript object identity are further milestones. Naming these graphic symbols does not imply those behaviors exist. SVG is the display backend; it does not replace the ActionScript virtual machine, media pipeline or file format parser.

## Representation

Existing version 1 projects remain unchanged. A project that creates a symbol becomes version 2 with an explicit `symbols` array. A version 2 project with an empty array is valid. Version 1 containing symbol instances or a nonempty symbol library rejects, and old version 1 players reject version 2 rather than silently showing incomplete artwork.

A definition has an ID, name, width, height, duration, camera and ordered nodes. Definitions use the document FPS. Each symbol instance contains `symbolId`, `playback`, `firstFrame` and `startFrame`, plus the ordinary layer transform, opacity, visibility, blend and geometric mask fields. Definitions can contain instances of other definitions.

At parent frame `f`, with definition duration `d` and first frame `a`:

```text
elapsed = max(0, f - startFrame)
loop    = (elapsed + a) modulo d
once    = min(d - 1, elapsed + a)
single  = min(d - 1, a)
```

Frames before the start hold the first frame; start is not an appearance or visibility key. Definitions reuse the same FPS, so no resampling convention is hidden in this formula. Nested clocks apply this rule at every parent boundary. Seeking a frame produces the same result regardless of playback history.

An instance applies its own transform and then scales the definition coordinates by instance width/definition width and instance height/definition height. A definition has no implicit clipping rectangle. Its authored masks continue to clip explicitly. Its own camera projects any local 3D children.

## Transactions and storage

The full root document remains authoritative while the editor displays a definition. Editing scope changes the visible nodes, dimensions, camera and timeline only. History, autosave, JSON downloads, embeds and import/export always retain the full root project. New/import/template replacement exits the scope. Undo restores a valid scope or returns to Scene if that definition no longer exists.

Conversion validates a candidate, preserves child timing and transforms, stores a shared definition, and replaces the selection with an instance in one transaction. Placing an instance references existing source. Editing a definition updates all references. Deleting an instance leaves its definition. Deleting a referenced definition rejects with an actionable message. A failure commits no partial document, history or selection change.

## Resource and trust boundaries

Untrusted project JSON remains limited to 5 MB. Validate the graph before recursive rendering or sample allocation. Require unique definition IDs, unique node IDs within each scope, known references, an acyclic graph and nesting no deeper than eight symbol references. Bound source definitions and the expanded visible workload, including repeated references and unused definitions.

Expanded nodes, keyframes, text, mesh triangles and effects consume existing scene limits. Reusing one expensive definition must not bypass a limit by keeping the serialized source small. Descendant filter bounds include cumulative instance scale. Geometric masks do not lower filter budgets. Instance container blur/glow is rejected until accurate descendant filter envelopes exist; leaf effects remain available.

Renderer IDs encode the full instance path without ambiguous concatenation. Each SVG renderer also has its own namespace. Repeated definitions cannot share a mutable mask or filter accidentally. Serialized attributes remain allowlisted and escaped. No arbitrary SVG, remote assets, DOM script evaluation or new network authority is introduced.

## Implementation options

| Option | Authoring cost | Playback cost | Fidelity and risk |
| :--- | :--- | :--- | :--- |
| Clone all children on insertion | Low initial change | Repeats all state | Shared edits and symbol identity fail |
| Reference definitions and retain nested SVG groups | Moderate model and editor change | Proportional to expanded visible content | Chosen; explicit local clocks and shared source |
| Implement Flash MovieClip and AVM semantics immediately | Much larger interpreter and lifecycle change | Requires measured runtime scheduling | Necessary later, but cannot be certified by graphic timeline tests |

The retained renderer and exporters share the model's local frame calculation. Animated SVG samples the root timebase while retaining the hierarchy; it must count repeated geometry, keys and output bytes before allocation. Version 1 output must remain identical.

## Acceptance

1. Convert animated artwork, insert a second instance, edit the shared definition and observe both instances change.
2. Nest a definition and verify loop, once, single frame, first frame and start offset through actual visible geometry.
3. Author with the same stage and timeline controls on desktop and a phone viewport; delete and undo without a keyboard.
4. Save, reload, import and export while inside a definition without losing the root scene or another definition.
5. Match retained geometry to still/animated SVG at the same frames; verify separate embeds maintain separate playheads and definition namespaces.
6. Reject cycles, missing references, excessive nesting, repeated expensive content and unsupported container effects atomically.
7. Run existing editor, runtime, export, camera, mask and mobile gates. Record measured browser costs without claiming physical device FPS.

Rollback is a revert and Pages redeploy. Download version 2 project backups before rollback: an older player will reject them. Do not rewrite those files as version 1.
