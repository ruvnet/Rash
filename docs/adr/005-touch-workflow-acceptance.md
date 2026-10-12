# ADR 005: Accept workflows through their visible controls

Status: accepted, 12 October 2026.

## Context

The initial release passed 19 UI checks but exposed no mobile menu route for several editing operations. Testing a drawer's open class did not establish that a person could edit or remove an object. API export checks also missed the absent PNG button.

## Decision

Touch authoring has a visible selection toolbar with Edit, Duplicate, Delete, Undo and Redo. The More menu exposes commands without a hardware keyboard. Mobile drawers use large controls, exact frame entry and a separate text dialog. Layout tests include portrait and landscape. Chromium touch gestures and WebKit touch taps are separate evidence; neither proves physical iOS keyboard or sharing behavior.

Release tests mutate projects through visible controls, inspect the resulting document and SVG, verify downloaded file bytes, then reload to establish persistence. A class toggle is insufficient. Tests may read public diagnostics but must not invoke internal application handlers to stand in for user interaction.

Editing must preserve these invariants:

1. Selecting without changing an object preserves redo.
2. Locked layers reject authoring mutations consistently. Duplicating may create an unlocked copy.
3. Invalid edits restore the previous project and history and expose an error.
4. Changing FPS preserves keyframe wall time within the destination frame resolution.
5. Playback cannot persist simulated game state into the authored scene.
6. Path dimensions affect actual geometry in rendering and exports.
7. Text is bounded to 256 lines per layer and 10,000 lines per project before SVG element creation.

## Consequences

CI runs desktop, touch, workflow, exporter, embedded game and runtime checks before Pages deployment. A deployed browser pass is recorded separately from local and CI results. Device specific gaps and broader Flash compatibility remain explicit in the capability matrix. This raises release time by roughly one minute of browser work plus runner scheduling, while detecting failures that module tests cannot find.
