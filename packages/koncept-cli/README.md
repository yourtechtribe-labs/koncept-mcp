# @yourtechtribe-labs/koncept-cli

> CLI for [koncepto](https://github.com/yourtechtribe-labs/koncept-mcp) — initialize, verify (with auto-link suggestions), list, link, and impact analysis (`affected`) on `.koncept/` semantic concept graphs.

**Status**: pre-alpha (`v0.2.0-alpha.0`).

## Install

```bash
pnpm add -D @yourtechtribe-labs/koncept-cli@alpha
```

Or run one-off via `npx`:

```bash
npx -y @yourtechtribe-labs/koncept-cli@alpha <command>
```

## Commands

### `koncepto init`

Bootstraps `.koncept/concepts/`, `.koncept/index.json`, and `.koncept/README.md` in the current directory.

```bash
npx koncepto init
```

### `koncepto verify`

Validates every concept YAML against the schema, checks cross-references, and writes the index. Exits non-zero on any issue (parse error, duplicate id, unresolved related concept, missing participant file). On a clean run, also surfaces auto-link suggestions (pairs of concepts that share participants or tags but are not linked via `related_concepts`) — non-blocking; pass `--no-suggestions` to silence.

```bash
npx koncepto verify
npx koncepto verify --no-suggestions
```

### `koncepto list`

Tabular listing of every concept in the registry with id, type, status, and name.

```bash
npx koncepto list
```

### `koncepto link <id> <file> --role=<r> --purpose=<p>`

Adds a participant entry to an existing concept. Idempotent — duplicates are rejected.

```bash
npx koncepto link concept-schema src/lib/foo.ts --role=reader --purpose="parses concepts at startup"
```

Roles: `writer`, `reader`, `tester`, `docs`.

### `koncepto affected [--from <ref>] [--files=a,b,c] [--json]`

Reports which concepts and invariants are touched by a set of changed files. Defaults to `git diff --name-only HEAD`; pass `--from HEAD~3` for a wider range or `--files=path1,path2` to bypass git entirely. Output is grouped by concept, ordered by max severity. Exits `1` when any touched invariant has severity `high` (useful as a pre-commit gate), `0` otherwise, `2` on operational failure.

```bash
npx koncepto affected
npx koncepto affected --from HEAD~5 --json
npx koncepto affected --files=src/auth.ts,src/db.ts
```

## Companion package

Pair this CLI with [`@yourtechtribe-labs/koncept-mcp-server`](https://www.npmjs.com/package/@yourtechtribe-labs/koncept-mcp-server) to expose your concept graph to AI coding agents (Claude Code, Cursor, etc.) over MCP.

## License

MIT — see [LICENSE](./LICENSE).

## Repository

Source, issues, and full docs at [github.com/yourtechtribe-labs/koncept-mcp](https://github.com/yourtechtribe-labs/koncept-mcp).
