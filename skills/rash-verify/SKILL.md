---
name: rash-verify
description: Verify Rash Studio scenes, ActionScript subset behavior, resource links, portable embeds, exports, and desktop or mobile interaction. Use for Rash acceptance checks, compatibility review, security review, or release validation.
---

# Verify a Rash change

1. Read current `docs/compatibility.md`, `docs/security.md`, and touched source files. Define the expected observable result before running a test.
2. Validate project JSON with `validateProject` or `parseProject`. Check unique IDs, bounded dimensions and frame duration, supported node types, and keyframe ranges.
3. Run `npm test`, `cargo test`, and `npm run test:ui` as applicable. Capture exit codes and actual assertion counts. Inspect desktop and mobile screenshots for clipping, keyboard focus, unreachable dialogs, and broken timeline controls.
4. For scripting changes, verify a successful scene update plus a rejected unsupported feature and bounded infinite loop. Confirm errors commit no partial scene commands. Read the Rust source and worker bridge rather than assuming ActionScript semantics.
5. For export changes, decode generated GIF, MP4, or PDF with an independent reader where available. Verify dimensions, duration, content, and MIME type. Browser capability detection does not prove a codec can encode this project.
6. For embed changes, test a separate host page. Verify origin and message boundaries, no top-level navigation, no privileged host access, and visible loading failures.
7. Run `node scripts/metaharness-evaluate.mjs` for real RuVector WASM parity and search latency. Add `--with-cli` only when static MetaHarness analysis is requested. Its scorecard is a repository heuristic, not proof of safety, test coverage, self improvement, or learned semantics.
8. Record failures before proposed fixes. Re-run the smallest meaningful affected test after remediation. Report unverified claims as unverified; never turn a roadmap into a compatibility statement.

Do not deploy, publish, install hooks, change access controls, upload private projects, or begin paid inference solely as part of validation.

For MCP changes, run `npm run test:mcp` and `npm run test:mcp-ui`. Cover initialize, discovery, CRUD, revision conflicts, resources, persistence, tenant isolation and rejected input. A browser bridge harness validates the resource and protocol, not a real ChatGPT or Claude session. Verify a live host tool call and view separately before claiming host acceptance.
