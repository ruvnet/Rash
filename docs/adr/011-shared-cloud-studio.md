# ADR 011: Shared Studio and MCP project storage

Status: accepted for implementation.

## Decision

Serve the full Studio at `/studio/` on the existing private Sites origin. The Studio calls the existing `/mcp` protocol with same origin credentials. The verified Sites user identity selects the same R2 namespace used by the connected MCP plugin. The public GitHub Pages Studio links to the authenticated Studio and never receives credentials or cloud project data automatically.

## Invariants

* Every Studio asset requires a verified gateway identity. Worker routes must never be exposed without that gateway.
* Cloud writes are explicit. Device autosave remains local.
* Every update and deletion uses the observed revision; a conflict preserves the editor draft.
* Opening a cloud project requires explicit replacement consent. Deletion requires a second confirmation and preserves the local composition.
* New compositions and imported JSON detach from the prior cloud identity.
* Runtime scripts are evaluated by the existing bounded Worker/WASM runtime, never JavaScript eval.

## Tradeoffs

The full Studio bundle adds approximately 0.75 MB compressed to the private Worker. The 28 MB legacy Ruffle distribution remains on GitHub Pages; private Studio links to the public legacy player without passing project data. Local stdio storage remains separate. Moving a public browser composition requires JSON download/import; no cross origin credential bridge is introduced.

## Acceptance

`node tests/studio-cloud-browser.mjs` creates through the real MCP service, opens and edits in Studio, saves with revision checking, reads through MCP, exercises conflicts and deletion, and verifies mobile JSON export integrity. `node --test tests/mcp-cloud.test.js` covers authentication, namespace isolation and asset routes. Browser harness results do not replace physical device or native ChatGPT/Claude host acceptance.
