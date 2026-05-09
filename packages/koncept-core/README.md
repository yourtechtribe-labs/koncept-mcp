# @yourtechtribe-labs/koncept-core

> Core schema, parser, and indexer for [koncepto](https://github.com/yourtechtribe-labs/koncept-mcp) — semantic concept graphs for codebases.

**Status**: pre-alpha (`v0.2.0-alpha.0`).

## What this package contains

- **Zod schema** for the YAML concept format (`ConceptSchema`, `KEBAB_ID_REGEX`, enums)
- **Parser** that loads `.koncept/concepts/*.yaml` and validates against the schema
- **Indexer** that scans the registry, detects duplicate ids, unresolved cross-refs, and missing participant files
- **Search API** for in-memory queries over the index
- **Path helpers** for cross-platform path normalization

This is the runtime foundation. End users normally interact with [`@yourtechtribe-labs/koncept-cli`](https://www.npmjs.com/package/@yourtechtribe-labs/koncept-cli) or [`@yourtechtribe-labs/koncept-mcp-server`](https://www.npmjs.com/package/@yourtechtribe-labs/koncept-mcp-server) and don't import this directly.

## Install

```bash
pnpm add @yourtechtribe-labs/koncept-core@alpha
```

## Usage

```ts
import { indexConcepts, isIndexClean, ConceptSchema } from '@yourtechtribe-labs/koncept-core'

const result = await indexConcepts(process.cwd())
if (!isIndexClean(result)) {
  console.error('registry has issues:', result)
}
```

## License

MIT — see [LICENSE](./LICENSE).

## Repository

Source, issues, and full docs at [github.com/yourtechtribe-labs/koncept-mcp](https://github.com/yourtechtribe-labs/koncept-mcp).
