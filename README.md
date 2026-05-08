# koncepto

> Semantic concept graph MCP server for codebases — what your code **means**, not just what it does.

[![Status](https://img.shields.io/badge/status-pre--alpha-orange)]() [![License](https://img.shields.io/badge/license-MIT-blue)]() [![pnpm](https://img.shields.io/badge/pnpm-workspace-yellow)]() [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/yourtechtribe-labs/koncept-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/yourtechtribe-labs/koncept-mcp)

## What

Code graphs (Aider repomap, GitNexus, Sourcegraph) capture **structural** relations: who imports who, who calls who. They miss **semantic** invariants — the cross-cutting concepts that live in code not related by imports:

- "Fix B" lives in 7 files but isn't a function or a class
- "All UI counting workload must exclude manual-override participants"
- "Sector value strings must match `SectorAssignment.sector` keys exactly"

`koncepto` is the curated semantic layer. Concepts in YAML, queryable via MCP tools, read at Step 0 before editing.

## Status

**Pre-alpha** (`v0.1.0-alpha.3` on npm). Schema and tool surface may break before `0.1.0` final. See [roadmap](./ROADMAP.md).

Dogfooded against this repo itself: 5 concepts in [.koncept/concepts/](./.koncept/concepts/) cover the schema, the registry, the MCP tool contract, the monorepo shape, and the kebab-id naming convention. `pnpm dogfood` = `koncepto verify` against its own registry.

## Quickstart

```bash
# Install in your project
pnpm add -D @yourtechtribe-labs/koncept-cli@alpha

# Bootstrap
npx koncepto init

# Write a concept (YAML)
$EDITOR .koncept/concepts/my-concept.yaml

# Verify
npx koncepto verify

# Register MCP server (Claude Code)
claude mcp add --scope user koncepto -- \
  npx -y @yourtechtribe-labs/koncept-mcp-server@alpha "$PWD"
```

## Architecture

3 packages under pnpm workspace:

- `@yourtechtribe-labs/koncept-core` — Zod schema, YAML parser, indexer
- `@yourtechtribe-labs/koncept-mcp-server` — MCP stdio server (4 tools)
- `@yourtechtribe-labs/koncept-cli` — `init`, `verify`, `list`, `link`

## License

MIT — see [LICENSE](./LICENSE).
