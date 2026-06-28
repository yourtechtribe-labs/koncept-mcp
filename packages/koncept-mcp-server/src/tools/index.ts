import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerKonceptGet } from './koncept-get.js'
import { registerKonceptSearch } from './koncept-search.js'
import { registerKonceptForFile } from './koncept-for-file.js'
import { registerKonceptInvariantsAtScope } from './koncept-invariants-at-scope.js'
import { registerKonceptAffected } from './koncept-affected.js'
import { registerKonceptLintNaming } from './koncept-lint-naming.js'

export interface ToolContext {
  rootDir: string
}

export function registerAllTools(mcp: McpServer, ctx: ToolContext): void {
  registerKonceptGet(mcp, ctx)
  registerKonceptSearch(mcp, ctx)
  registerKonceptForFile(mcp, ctx)
  registerKonceptInvariantsAtScope(mcp, ctx)
  registerKonceptAffected(mcp, ctx)
  registerKonceptLintNaming(mcp, ctx)
}
