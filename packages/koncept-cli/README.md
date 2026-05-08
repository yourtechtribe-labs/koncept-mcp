# @yourtechtribe-labs/koncept-cli

> CLI for [koncepto](https://github.com/yourtechtribe-labs/koncept-mcp) — initialize, verify, list, and link operations on `.koncept/` semantic concept graphs.

**Status**: pre-alpha (`v0.1.0-alpha.1`).

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

Validates every concept YAML against the schema, checks cross-references, and writes the index. Exits non-zero on any issue (parse error, duplicate id, unresolved related concept, missing participant file).

```bash
npx koncepto verify
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

## Companion package

Pair this CLI with [`@yourtechtribe-labs/koncept-mcp-server`](https://www.npmjs.com/package/@yourtechtribe-labs/koncept-mcp-server) to expose your concept graph to AI coding agents (Claude Code, Cursor, etc.) over MCP.

## License

MIT — see [LICENSE](./LICENSE).

## Repository

Source, issues, and full docs at [github.com/yourtechtribe-labs/koncept-mcp](https://github.com/yourtechtribe-labs/koncept-mcp).
