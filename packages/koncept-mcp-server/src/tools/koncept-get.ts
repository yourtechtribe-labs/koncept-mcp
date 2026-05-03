import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { indexConcepts, parseConceptFile } from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'

const KEBAB = /^[a-z][a-z0-9-]+$/

export function registerKonceptGet(mcp: McpServer, ctx: ToolContext): void {
  mcp.registerTool(
    'koncept_get',
    {
      description:
        'Fetch a concept document by its kebab-case id. Returns the full Concept (purpose, participants, invariants, related_concepts).',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      if (!KEBAB.test(id)) {
        return jsonResult({ error: 'invalid_id', id })
      }
      const index = await indexConcepts(ctx.rootDir)
      const entry = index.entries.find((e) => e.id === id)
      if (!entry) return jsonResult({ error: 'not_found', id })

      const parsed = await parseConceptFile(entry.file)
      if (!parsed.concept) {
        return jsonResult({
          error: 'parse_failed',
          id,
          reason: parsed.errors[0]?.type ?? 'unknown',
        })
      }
      return jsonResult({ concept: parsed.concept })
    },
  )
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  }
}
