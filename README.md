# koncepto

> Semantic concept graph MCP server for codebases — what your code **means**, not just what it does.

[![Status](https://img.shields.io/badge/status-pre--alpha-orange)]() [![License](https://img.shields.io/badge/license-MIT-blue)]() [![pnpm](https://img.shields.io/badge/pnpm-workspace-yellow)]()

## What

Code graphs (Aider repomap, GitNexus, Sourcegraph) capture **structural** relations: who imports who, who calls who. They miss **semantic** invariants — the cross-cutting concepts that live in code not related by imports:

- "Fix B" lives in 7 files but isn't a function or a class
- "All UI counting workload must exclude manual-override participants"
- "Sector value strings must match `SectorAssignment.sector` keys exactly"

`koncepto` is the curated semantic layer. Concepts in YAML, queryable via MCP tools, read at Step 0 before editing.

## Status

**Pre-alpha** (v0.1 in development). See [spec](https://github.com/yourtechtribe-labs/koncept-mcp) and [roadmap](./ROADMAP.md).

POC: dogfooded at koncepto itself + Fira Dashboard (PRUAB).

## Quickstart

> Coming with v0.1.0-alpha.1

```bash
# Install in your project
pnpm add -D @yourtechtribe-labs/koncept-cli

# Bootstrap
npx koncepto init

# Write a concept (YAML)
$EDITOR .koncept/concepts/my-concept.yaml

# Verify
npx koncepto verify

# Register MCP server (Claude Code)
claude mcp add --scope user koncepto -- \
  npx -y @yourtechtribe-labs/koncept-mcp-server@latest "$PWD"
```

## Architecture

3 packages under pnpm workspace:

- `@yourtechtribe-labs/koncept-core` — Zod schema, YAML parser, indexer
- `@yourtechtribe-labs/koncept-mcp-server` — MCP stdio server (4 tools)
- `@yourtechtribe-labs/koncept-cli` — `init`, `verify`, `list`, `link`

## License

MIT — see [LICENSE](./LICENSE).
