import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  ConceptSchema,
  indexConcepts,
  parseConceptFile,
} from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'
import { KEBAB_ID_REGEX } from './_shared.js'

const inputSchema = { id: z.string().min(1) }

const outputSchema = {
  concept: ConceptSchema.optional(),
  error: z.enum(['not_found', 'invalid_id', 'parse_failed']).optional(),
  id: z.string().optional(),
  reason: z.string().optional(),
}

export function registerKonceptGet(mcp: McpServer, ctx: ToolContext): void {
  mcp.registerTool(
    'koncept_get',
    {
      title: 'Get concept by id',
      description:
        'Fetch a concept document by its kebab-case id. Returns the full Concept (purpose, participants, invariants, related_concepts).',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      if (!KEBAB_ID_REGEX.test(id)) return errorResult({ error: 'invalid_id', id })

      const index = await indexConcepts(ctx.rootDir)
      const entry = index.entries.find((e) => e.id === id)
      if (!entry) return errorResult({ error: 'not_found', id })

      const parsed = await parseConceptFile(entry.file)
      if (!parsed.concept) {
        return errorResult({
          error: 'parse_failed',
          id,
          reason: parsed.errors[0]?.type ?? 'unknown',
        })
      }
      const payload = { concept: parsed.concept }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}

function errorResult(payload: Record<string, string>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  }
}
