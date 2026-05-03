import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { indexConcepts, searchEntries } from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'

export function registerKonceptSearch(mcp: McpServer, ctx: ToolContext): void {
  mcp.registerTool(
    'koncept_search',
    {
      description:
        'Fuzzy-search concepts by id/name/tag. Returns ranked matches with id, name, type, score, snippet.',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ query, limit }) => {
      const index = await indexConcepts(ctx.rootDir)
      const hits = searchEntries(index.entries, query, limit ?? 10)
      const matches = hits.map((h) => ({
        id: h.entry.id,
        name: h.entry.name,
        type: h.entry.type,
        score: h.score,
        matched_on: h.matchedOn,
      }))
      const payload = { matches }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}
