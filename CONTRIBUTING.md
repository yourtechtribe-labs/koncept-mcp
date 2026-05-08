# Contributing to koncepto

Thanks for considering a contribution. koncepto is pre-alpha and small enough that lightweight process beats ceremony — read this once, then just open the PR.

## Ground rules

- **Open an issue first** for non-trivial changes (new tool, schema field, breaking refactor). 5 minutes of "is this in scope?" up front saves rewriting a PR.
- **Trivial changes** (typo, broken link, obvious bug fix, doc clarification): open the PR directly. Skip the issue.
- **Pre-alpha = schema can break**. Until `0.1.0` final, breaking changes are fine if the PR includes a migration note. After `0.1.0`, deprecation cycles apply.

## Project shape — read before coding

koncepto is a **library + CLI + MCP server**, not an application. Anti-patterns we explicitly reject:

- ❌ `src/features/<feature>/handler.ts` vertical slice — files are organized by capability (schema, parser, indexer), not by feature.
- ❌ A shared `domain/` layer across packages — cross-package facts live as concepts in `.koncept/concepts/`, not as code abstractions.
- ❌ Adding a new top-level package without an ADR.
- ❌ Adding a runtime dependency without explicit discussion in the PR. We stay small and dependency-light by design.

If your PR introduces any of these, expect pushback or a request for context.

## Setup

```bash
git clone https://github.com/yourtechtribe-labs/koncept-mcp
cd koncept-mcp
pnpm i                  # pnpm 11+ required (see packageManager in root package.json)
pnpm verify             # build + test + lint across all packages
pnpm dogfood            # validate the project's own .koncept/ registry
```

If `pnpm verify` fails on a clean clone, that's a bug — open an issue.

## Adding a concept

The fastest way to understand the project is to write a concept YAML. The 5 existing ones in [`.koncept/concepts/`](./.koncept/concepts/) are real examples covering each `type` value.

```bash
$EDITOR .koncept/concepts/my-concept.yaml
pnpm dogfood            # `koncepto verify` against the registry
```

If `pnpm dogfood` fails, the error message tells you what's wrong (parse error, duplicate id, unresolved cross-ref, missing participant file).

## Adding a tool to the MCP server

1. Create `packages/koncept-mcp-server/src/tools/<verb>.ts` (kebab filename).
2. Tool name registered with the server is **snake_case** (`koncept_<verb>`) — see existing tools.
3. Define a Zod input schema. No `as any`, no untyped `request.params.arguments`.
4. Business logic lives in `koncept-core`. The tool file is a thin adapter: validate input → call core → format output.
5. Tools must be **read-only**. The CLI is the only writer.
6. Add a test in `packages/koncept-mcp-server/tests/tools.test.ts`.

## Commit conventions

Conventional commits, with project-specific scopes:

```
type(scope): description

Types:  feat, fix, docs, refactor, test, chore, perf, improve, ci, release
Scopes: core, mcp-server, cli, repo, deps, ci
```

Examples (lifted from the actual log):

- `feat(cli): day 3 — argv parser + 4 commands (init, verify, list, link)`
- `improve(mcp-server): complete tool registration surface (PAT-026)`
- `fix(ci): bump pnpm 10->11 + Node 22->24 for OIDC trusted publishing`
- `docs(repo): refresh README + add ROADMAP`

## Branches and PRs

- Branch from `main`. Naming: `feature/<short>`, `fix/<short>`, `refactor/<short>`, `docs/<short>`, `chore/<short>`.
- One logical change per PR. Two refactors in one PR = harder to review and revert.
- CI must pass (`build + test + lint + dogfood`) before merge.
- Squash-merge by default. Keeps `main` linear.

## Running the MCP server locally

```bash
pnpm -r build
node packages/koncept-mcp-server/dist/index.js "$PWD"
```

Then point an MCP client at it. For Claude Code:

```bash
claude mcp add --scope user koncepto-dev -- \
  node /absolute/path/to/koncept-mcp-server/dist/index.js "$PWD"
```

Stop the registered server with `claude mcp remove koncepto-dev` when done.

## Reporting bugs

GitHub Issues. Include: koncepto version (`npx koncepto --version` once 0.1.0 ships, otherwise the alpha tag), Node version, OS, and a minimal `.koncept/` reproduction if applicable. Bug template at [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) (added with the issue forms — see item below).

## Reporting security issues

**Don't open a public issue.** See [SECURITY.md](./SECURITY.md) for the private vulnerability reporting flow.

## License

By contributing, you agree your contribution is licensed under MIT (the project license). No CLA, no DCO sign-off required at this stage.
