# ADR 004: A passive Claude authoring package

Status: Accepted; package validation is separate from a live Claude host session.

## Decision

Ship a standard `.claude-plugin/plugin.json`, a repository marketplace manifest, and two skills: `rash-author` and `rash-verify`. Keep the skills in the plugin root `skills/` directory, as required by the Claude package layout. Provide no background hooks, shell interception, automatic deployment or invented MCP endpoint.

The authoring skill grounds every project in the current schema and export implementation. The verification skill requires actual tests and distinguishes runtime support, browser capability detection, measured results and roadmap claims.

## Installation

From the repository root, use a local session:

```sh
claude --plugin-dir .
```

For marketplace installation in Claude:

```text
/plugin marketplace add ruvnet/Rash
/plugin install rash@rash-tools
```

Then invoke `/rash:rash-author` or `/rash:rash-verify`. Validate the package in an installed CLI with `claude plugin validate .`. JSON and skill frontmatter checks alone do not prove that a particular Claude host version loaded the package.

## Sources

* [Claude plugin manifest reference](https://code.claude.com/docs/en/plugins-reference)
* [Claude marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces)
