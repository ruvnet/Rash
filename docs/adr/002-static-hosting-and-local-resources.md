# ADR 002: Static hosting, local persistence and rash resources

Status: Accepted for the initial implementation.

## Decision

Host the studio, worker, WASM modules and embed assets on GitHub Pages. Keep browser autosave local and provide explicit portable project JSON export. A server is not required for editing or playback. Cloudflare persistence is deferred until cross-device account synchronization is actually required.

Define `rash://<type>/<id>` as a local address with the allowlisted types `project`, `template`, `node`, and `help`. `rash://project/current` resolves the current project. Resource resolution returns isolated data and never executes a command or fetches a URL. The registry exposes separate allowlisted `play`, `pause`, `seek`, and `select` controls; seek takes a zero-based frame index below the project duration.

Reject traversal, credentials, query strings, fragments, control characters, external schemes and encoded path separators. IDs must fit the conservative ASCII identifier grammar in `web/core/resources.js`. Unknown resources fail visibly.

## Constraints

Autosave is a convenience, not a durable backup. Clearing site storage removes it. No account, team synchronization, secret management or public upload endpoint is implied by static hosting. No Cloudflare credential belongs in an exported project, HTML page or JavaScript bundle.

If remote persistence is added, require a separate ADR covering tenant authorization, identity, object ownership, quotas, signed upload lifetimes, deletion, CORS and a migration/export path. Never use an unauthenticated shared key-value namespace as project storage.

## Acceptance

Load the deployed studio and embed under the repository subpath. Edit and reload a project in the same browser, then export/import JSON in an independent session. Exercise all URI rejection cases in `tests/ecosystem.test.js`. Verify custom host pages do not gain project-script execution privileges.
