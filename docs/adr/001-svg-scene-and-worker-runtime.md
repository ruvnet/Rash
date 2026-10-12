# ADR 001: Retained SVG scenes and bounded worker scripting

Status: Accepted for the initial implementation.

## Context

Rash needs the stage, layers, timeline and property editing of a Flash authoring tool, with portable HTML embeds on static hosting. Full Adobe Flash compatibility includes the AVM1 and AVM2 virtual machines, SWF parsing, Flash display, text, sound, networking and event APIs. A new bounded source interpreter cannot honestly be described as providing that compatibility.

## Decision

Keep a versioned project model separate from SVG DOM nodes. Represent rectangles, ellipses, text and paths with a retained node map. Evaluate numeric timeline tracks deterministically, update changed attributes, and remove missing nodes. Keep controls as accessible HTML rather than reimplementing forms and keyboard behavior inside SVG.

Run the Rust interpreter as WebAssembly inside a dedicated worker. Scripts receive scene data and return allowlisted commands. They receive no DOM, fetch, host page, filesystem or credential capabilities. Source size, token count, operation budget, output size and recursion are bounded. The worker boundary provides isolation from synchronous UI execution; the language capability boundary prevents author scripts from invoking browser APIs.

Call the current language RashScript, an ActionScript inspired subset. Reject unsupported language features explicitly. Preserve full ActionScript compatibility as a separate, corpus-tested roadmap item rather than making an unsupported release claim.

## Consequences

The stage stays vector based and inspectable. Small scenes avoid GPU context allocation and texture memory. DOM traversal and path tessellation remain browser costs; SVG is not assumed faster than Canvas or WebGPU for dense particles. The implementation is not a new GPU rasterizer, a SWF emulator, or a full AS3 compiler.

Keep a benchmark that measures scene evaluation and actual browser rendering separately. Large-scene evidence can justify an additional WebGPU backend later without replacing the project format. Browser feature detection must provide a visible failure or fallback when worker or WASM construction is unavailable.

## Acceptance

Run unit and browser tests. Check keyframe interpolation, retained node identity, redraw correctness, invalid source rejection, transactional script errors and bounded infinite loops. Treat screenshot evidence as visual verification, not proof of language compatibility.
