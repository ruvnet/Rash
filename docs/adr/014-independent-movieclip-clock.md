# ADR 014: Independent MovieClip transport clocks

Status: accepted for implementation; lifecycle events and scripts remain separate gates.

## Context

Rash graphic symbols map a definition timeline from their parent timeline. That is useful for synchronized composition, but it cannot represent the defining MovieClip behavior where a nested animation keeps advancing beneath a held or looping parent.

## Decision

Symbol instances accept `playback: "movieclip"`. Loop, Play once and Hold retain their existing parent-clock behavior. MovieClip maps `firstFrame` and `startFrame` from a monotonic root transport frame. Pausing freezes that transport; resuming retains phase; seeking and restarting reset it to the chosen scene frame. Instances do not allocate timers or mutable per-instance state.

The retained renderer receives the scene frame and transport frame separately. The scene frame selects root artwork; the transport frame reaches every nested MovieClip regardless of held ancestors. Frame insertion and removal do not retime a MovieClip's transport delay. FPS changes do retime it so its wall-clock delay remains stable.

Animated SVG has no runtime transport, so export uses the least common multiple of the root duration and reachable MovieClip definition durations. A delayed MovieClip has a one-time warm-up that a single indefinitely repeating SMIL cycle cannot preserve, so animated SVG and standalone HTML reject MovieClip `startFrame > 0` with a corrective message. The common period is rejected above 36,000 frames and is charged against existing layer-frame, triangle-frame, evaluation and output budgets before samples are allocated. Projects without MovieClips preserve their previous SVG bytes and repeat behavior.

## Consequences and limits

The new mode establishes independent deterministic clocks in the editor, embed player and SVG export. It does not implement display-list activation, `stop()` on an individual clip, frame scripts, lifecycle events, event propagation or Button states. Hidden MovieClips retain deterministic phase. Root RashScript timeline commands still control only the root scene.

Acceptance requires a held graphic containing a MovieClip whose 12-frame phase continues across a 20-frame root loop. Frame 5 and transport frame 25 must render different child geometry, and SVG must use the 60-frame common period. Browser emulation does not establish physical-device or native ChatGPT/Claude host acceptance.
