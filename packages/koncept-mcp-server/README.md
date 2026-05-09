# @yourtechtribe-labs/koncept-mcp-server

> MCP stdio server exposing [koncepto](https://github.com/yourtechtribe-labs/koncept-mcp) — semantic concept graph tools for AI coding agents.

**Status**: pre-alpha (`v0.2.0-alpha.0`).

## What it does

Reads a project's `.koncept/concepts/*.yaml` registry and exposes 5 read-only tools and 2 resource families over the [Model Context Protocol](https://modelcontextprotocol.io):

| Tool | Purpose |
|---|---|
| `koncept_search` | Full-text + tag search across concepts |
| `koncept_get` | Fetch a concept by id (full payload) |
| `koncept_for_file` | List concepts where a file appears as participant |
| `koncept_invariants_at_scope` | Return invariants whose concept overlaps a scope |
| `koncept_affected` | Given a list of changed file paths, report touched concepts/invariants ordered by max severity |

| Resource | Purpose |
|---|---|
| `koncept://concepts` | JSON index of every concept (id, name, type, status, uri) |
| `koncept://concept/{id}` | Full concept document by id |

Drop this in front of Claude Code, Cursor, or any other MCP client and the agent gains read-Step-0 awareness of cross-cutting semantic facts that don't show up in the AST.

## Install (Claude Code)

```bash
claude mcp add --scope user koncepto -- \
  npx -y @yourtechtribe-labs/koncept-mcp-server@alpha "$PWD"
```

## Install (other MCP clients)

The server expects a single positional arg: the project root containing a `.koncept/` directory.

```bash
npx -y @yourtechtribe-labs/koncept-mcp-server@alpha /path/to/project
```

## Bootstrap your project

Use the CLI ([`@yourtechtribe-labs/koncept-cli`](https://www.npmjs.com/package/@yourtechtribe-labs/koncept-cli)) to initialize the registry:

```bash
pnpm add -D @yourtechtribe-labs/koncept-cli@alpha
npx koncepto init
```

Then write concepts under `.koncept/concepts/<id>.yaml` and `npx koncepto verify`.

## License

MIT — see [LICENSE](./LICENSE).

## Repository

Source, issues, schema docs, and roadmap at [github.com/yourtechtribe-labs/koncept-mcp](https://github.com/yourtechtribe-labs/koncept-mcp).
