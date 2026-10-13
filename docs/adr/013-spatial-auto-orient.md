# ADR 013: Segment-level spatial auto-orientation

Status: accepted for implementation; release acceptance remains a separate gate.

## Context

Rash can store a cubic spatial segment on a destination position key and evaluate its X/Y path through one canonical scene evaluator. Artwork still follows its independently authored rotation. Motion-graphics and game workflows sometimes need the artwork to face the direction of travel, but that changes the meaning of rotation during a segment and therefore requires an explicit, portable contract.

This decision extends the destination-owned spatial segment. It does not add a reusable Flash guide layer, a general constraint system or an independent MovieClip runtime.

## Decision

Auto-orientation is an optional boolean on the destination key's existing spatial object:

```json
{
  "frame": 24,
  "x": 420,
  "y": 180,
  "spatial": {
    "out": [120, -80],
    "in": [-100, 40],
    "orient": true
  }
}
```

Only `true` is serialized. Omitted or `false` normalizes to omission and preserves the exact legacy rotation behavior. A non-boolean value is rejected. No document-version change is required.

## Rotation semantics

The destination key's global easing produces the shared spatial parameter described by [ADR 012](012-spatial-bezier-motion.md). While that segment is active, orientation is the analytic cubic tangent at the same eased parameter:

```text
rotation = atan2(dy, dx) × 180 / π
```

Coordinates and angles follow the SVG stage: positive X points right, positive Y points down, right is 0 degrees and down is 90 degrees. Auto-orientation **replaces** authored or keyframed rotation during the active segment; it does not add a base rotation offset. The segment start is included. An oriented segment also includes its exact destination and uses the incoming tangent at `t = 1`. Outside an active oriented segment, ordinary authored/keyframed rotation resumes. Adjacent segments opt in independently.

If the analytic derivative magnitude is below `1e-9`, evaluation samples the cubic immediately around the parameter with a bounded delta of `1e-4`. If that is still stationary, it uses the segment chord. A completely stationary segment falls back to the finite authored rotation. These fallbacks avoid `NaN` and make endpoints deterministic without inventing persistent state.

`evaluateNode` remains the canonical owner of both position and rotation. The stage renderer, preview, SVG/HTML output, retained JavaScript embed and browser media exporters consume evaluated scene state. Exporters must not estimate orientation from sampled output or implement a second tangent algorithm.

## Authoring behavior

The **Spatial path** section shows an **Orient to path** checkbox only after a spatial curve exists. It defaults off. Toggling it is one validated Undo/Redo step and is disabled for locked layers. Mouse, keyboard and touch use the same accessible control. Moving either tangent immediately changes the evaluated orientation because direction comes from the current cubic geometry.

The checkbox is ordinary project data, not an editor-only preference. Tangent arms and handles remain editor-only overlays and do not become exported artwork.

## Consequences and limits

The representation adds at most one boolean to an existing spatial destination. Evaluation remains constant-space and within existing frame, keyframe and export budgets. It provides deterministic facing along one cubic segment, including the destination, but can visibly return to authored rotation after that segment if the following segment does not also opt in. Authors who need continuous facing must enable the option on each relevant spatial destination.

This decision does **not** implement:

* reusable motion-guide layers or guide attachment across objects;
* banking, look-ahead, a user-defined rotation offset or a general path constraint;
* shape tweening or contour morphing;
* multiple scenes or scene navigation;
* an independent MovieClip clock, lifecycle or event loop;
* complete AS1, AS2 or AS3 behavior.

## Acceptance

Model tests must verify tangent angles at an interior frame and exact destination, disabled/omitted legacy rotation, invalid schema rejection and all stationary-path fallbacks. Browser tests must toggle the option through visible controls, observe rotation after tangent edits, prove one-step Undo/Redo and reject locked editing. SVG, embed and sampled media paths must match `evaluateNode` at the same frames. Release evidence must distinguish automated browser coverage, deployed-host verification, native ChatGPT/Claude acceptance and physical-device testing.
