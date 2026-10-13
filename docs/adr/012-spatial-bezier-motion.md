# ADR 012: Optional spatial cubic Bezier motion segments

Status: accepted for implementation; release acceptance remains a separate gate.

## Context

Rash already evaluates X/Y keyframes, displays their trajectory and lets an author drag existing position keys. Those position values still travel on a straight geometric segment. The existing `easing` and `bezier` fields describe progress over time; they are not spatial control points. A Flash-style motion workflow needs curved position segments without replacing the evaluator used by the editor, player, SVG export and embed.

This decision adds bounded spatial interpolation to an existing pair of position keys. It does not introduce a second guide-layer object model or imply Flash shape-tween, scene or ActionScript compatibility.

## Decision

An optional `spatial` object belongs to the destination key of a position segment:

```json
{
  "frame": 24,
  "x": 420,
  "y": 180,
  "spatial": {
    "out": [120, -80],
    "in": [-100, 40]
  }
}
```

For endpoints `P0` and `P3`, the cubic is `P0`, `P0 + out`, `P3 + in`, `P3`. `out` is therefore relative to the prior endpoint and `in` is relative to the destination. Offsets use SVG user-space units rather than CSS pixels, so zoom does not change authored geometry.

Both `out` and `in` must be finite two-number arrays. Each component is bounded to ±100,000. A destination with `spatial` must store both `x` and `y`. If an earlier key authors either position coordinate, the nearest such key must also store both `x` and `y`; otherwise the segment is rejected. When there is no preceding position key, the node's base X/Y pose at frame zero supplies `P0`. Invalid or incomplete spatial data is rejected rather than partially interpreted.

The document version does not change. Absence of `spatial` preserves the exact legacy interpolation and serialization shape: position follows a straight geometric segment while the existing temporal easing still controls progress.

## Time and geometry

The destination key's global `easing` and optional temporal `bezier` are evaluated once to produce a shared path-progress value. That one value drives both coordinates on the cubic. This prevents X and Y from reaching different places on the same spatial path.

Per-property `curves.x` and `curves.y` remain stored but do not control a spatial segment. They become effective again if `spatial` is removed. Other properties continue to use their existing global or per-property timing without change.

`evaluateNode` remains the canonical interpolation boundary. The stage renderer, trajectory overlay, preview, embed and exporters consume its evaluated X/Y result. Export code must not reimplement cubic motion or translate the segment into a second approximation with different timing.

## Authoring behavior

The Motion inspector exposes a **Spatial path** section for an existing destination position key. **Enable spatial curve** creates a geometry-preserving cubic with control points one third of the way along the original straight segment. **Remove spatial curve** restores legacy straight interpolation. When enabled, stage-space tangent handles edit its `out` and `in` offsets. A complete handle gesture is one validated Undo step; cancellation or validation failure restores the pre-gesture document. Locked layers expose no editable spatial handles. Mouse and touch share the same controls, and each invisible handle target remains 44 CSS pixels wide when the visible point is small or the composition is zoomed.

The path and handles are editor overlays. They are hidden during playback and game preview and never become exported artwork. Exported and embedded animation still follows the curve because those paths use the canonical evaluated scene state.

## Consequences and limits

Spatial data adds four bounded numbers to an existing destination key and counts within the existing keyframe and evaluation budgets. Trajectory sampling remains capped at 96 points and 49 key markers. Legacy files, keys without `spatial` and non-position properties are unchanged. The representation is deterministic, portable and inexpensive to validate, but it models one cubic per adjacent position-key segment rather than a reusable motion guide.

This decision does **not** implement:

* guide-layer creation or attachment across multiple objects;
* automatic orientation to the path (added later by ADR 013, outside this decision);
* shape tweening or morph topology;
* multiple scenes or scene navigation;
* an independent MovieClip clock, lifecycle or event loop;
* complete AS1, AS2 or AS3 semantics.

## Acceptance

Model tests must prove endpoint, midpoint, easing, sparse-key rejection, normalization bounds, legacy byte-shape preservation and removal fallback. Browser tests must author and drag tangent handles with mouse and touch, verify one-step Undo/Redo, reject locked editing and show a visibly curved trajectory. Export and embed tests must sample the same coordinates as `evaluateNode`. Release evidence must still distinguish automated browser coverage, deployed-host verification, native AI-host acceptance and physical-device testing.
