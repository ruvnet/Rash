# ADR 010: Shared MCP animation workspace

Status: accepted for implementation, real host acceptance remains a separate gate.

## Context

The previous Claude package contained authoring instructions but no MCP server. The browser `rash://` registry did not expose tools to external hosts. Users need to create, edit, preview and export the same validated scene format from an assistant.

## Decision

Use the existing scene model, renderer and SVG exporter behind seven bounded tools. A transport independent handler serves local stdio and authenticated stateless HTTP. Local storage uses private files and exclusive mutation locks. Hosted storage uses R2 namespaces derived from verified Sites identities and conditional writes. Every update, deletion and export checks its expected revision.

Provide one self contained MCP Apps resource. The view calls host tools, renders validated scenes into non executable image contexts, and preserves unsaved edits after revision conflicts. A private web shell uses the same resource and tools. GitHub Pages remains the public full studio. Local and hosted projects are separate stores, with explicit JSON export for portability.

## Consequences

The MCP service never executes ActionScript or arbitrary project scripts. Browser dependent GIF, MP4 and PDF remain full studio exports. Local Claude installation requires Node 22 or later. Hosted access requires the Sites identity gateway, which owns OAuth and replaces identity headers. The Worker must not be deployed as an unprotected endpoint trusting client headers.

Protocol tests and browser bridge tests are necessary but cannot prove a ChatGPT or Claude installation. Release reports must distinguish passing tests, published hosting, plugin provisioning, successful connection and real host view acceptance.

## Acceptance

Create a project, play and seek, edit a layer, save, export the exact revision, reject a concurrent edit, then delete with confirmation. Repeat phone controls in Chromium and WebKit. Verify cross tenant denial, bounded requests, conditional persistence and local restart recovery. Finally run a read only tool and render the view in each installed target host.
