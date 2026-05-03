import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  ConceptTypeEnum,
  indexConcepts,
  searchEntries,
} from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'

const inputSchema = {
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
}

const outputSchema = {
  matches: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: ConceptTypeEnum,
      score: z.number(),
      matched_on: z.array(z.enum(['id', 'name', 'tags'])),
    }),
  ),
}

export function registerKonceptSearch(mcp: McpServer, ctx: ToolContext): void {
  mcp.registerTool(
    'koncept_search',
    {
      title: 'Search concepts',
      description:
        'Fuzzy-search concepts by id/name/tag. Returns ranked matches with score and which fields matched.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, limit }) => {
      const index = await indexConcepts(ctx.rootDir)
      const hits = searchEntries(index.entries, query, limit ?? 10)
      const payload = {
        matches: hits.map((h) => ({
          id: h.entry.id,
          name: h.entry.name,
          type: h.entry.type,
          score: h.score,
          matched_on: h.matchedOn,
        })),
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}
