# Roadmap

Pre-alpha. Schema and tool surface are still in flux. Pin to a specific
version (`@yourtechtribe-labs/koncept-cli@0.1.0-alpha.3`) if you depend on it
in your own pipeline; the `@alpha` tag will keep moving forward.

## v0.1.0-alpha.x — schema iteration (now)

Latest: **`v0.1.0-alpha.3`** ([npm](https://www.npmjs.com/package/@yourtechtribe-labs/koncept-cli)).

- [x] Zod-validated YAML schema for concepts
- [x] CLI: `init`, `verify`, `list`, `link`
- [x] MCP server with 4 read-only tools: `koncept_search`, `koncept_get`, `koncept_for_file`, `koncept_invariants_at_scope`
- [x] Cross-reference + missing-file detection in `koncepto verify`
- [x] Public release on npm under `@yourtechtribe-labs/*`
- [x] OIDC trusted publishing with sigstore provenance attestations
- [ ] Real-world feedback from at least one external project consuming the MCP server
- [x] Schema refinements: structured `invariant.check` payload (`{kind: none | grep | command, ...}`) and typed `related_concepts` (`string | {id, type}` union with `extends | refines | conflicts-with | superseded-by | requires | related`). Breaking on `check`; `related_concepts` is non-breaking (string form still accepted).
- [ ] Scope expressions — richer `scopes` (line ranges, AST node selectors, regex over file content) instead of only file paths

## v0.1.0 — first stable

Schema freeze. Major-version bumps after this require a deprecation cycle.

- [ ] Schema feature-frozen for the 0.1.x line
- [ ] CHANGELOG with semver-meaningful entries
- [ ] Per-package CHANGELOG via [Changesets](https://github.com/changesets/changesets) or equivalent
- [ ] Documented migration path from `0.1.0-alpha.*` for existing registries
- [ ] Move npm `latest` dist-tag from the legacy `0.1.0-alpha.1` to `0.1.0`

## v0.2.x — feature surface

Direction, not commitment. Subject to dogfood and user feedback.

- [x] **Auto-link inference** — `koncepto verify` surfaces candidate `related_concepts` from shared participants + tag overlap. Non-blocking suggestions; `--no-suggestions` to silence.
- [x] **Impact analysis (`koncepto affected`)** — CLI command + MCP tool `koncept_affected`. Given a list of changed files (or `git diff --name-only` by default), reports concepts/invariants touched, ordered by max severity. Exit 1 on `high` invariants.
- [x] **MCP resources** — `koncept://concepts` (index) and `koncept://concept/{id}` (single concept) as readable resources alongside the 5 tools. Read-on-demand; no subscriptions yet.
- [ ] **Concept discovery in CI** — GitHub Action that runs `koncepto verify` on every PR and comments on broken cross-refs
- [ ] **Status semantics** — explicit deprecation/supersession flow in CLI (`koncepto deprecate <id> --superseded-by <new-id>`)
- [ ] **`koncepto check`** — execute the `kind: grep | command` payloads of `invariant.check` and report violations. Prerequisite (structured payload) is already in place.

## Beyond

Speculative, not on the calendar.

- **Invariant enforcement via LLM** — after `koncepto affected` identifies which invariants a diff touches, use an LLM call to read the invariant description + the changed code and judge whether the invariant still holds. Not a linter (no AST rules), but a semantic reviewer that flags "this change appears to violate the `send-requires-confirmation` invariant because `send_reply` is now reachable without the whitelist check."
- VS Code extension surfacing concepts in the editor sidebar
- Cursor / Zed / JetBrains MCP integrations beyond Claude Code
- Auto-extraction of concept candidates from PR review comments and DEVLOG entries
- Cross-repo concept federation (one concept registry shared by N projects)

## What we're not building

Setting expectations explicitly:

- Not a code graph. Concepts complement Aider/GitNexus/Sourcegraph, they don't replace them.
- Not an automatic semantic extractor. Concepts are curated, not inferred from the AST.
- Not a documentation generator. Concepts live next to code, not as prose.

## Contributing

The repo is open and MIT-licensed. Issues and PRs welcome at
[github.com/yourtechtribe-labs/koncept-mcp](https://github.com/yourtechtribe-labs/koncept-mcp/issues).
