import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  ConceptTypeEnum,
  RoleEnum,
  indexConcepts,
  parseConceptFile,
} from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'
import { normalizePath } from './_shared.js'

const inputSchema = { path: z.string().min(1) }

const outputSchema = {
  matches: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: ConceptTypeEnum,
      role: RoleEnum,
      purpose: z.string(),
    }),
  ),
}

export function registerKonceptForFile(mcp: McpServer, ctx: ToolContext): void {
  mcp.registerTool(
    'koncept_for_file',
    {
      title: 'Concepts for file',
      description:
        'List concepts that participate in a given file path. Returns each concept with its role and purpose for that file.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ path: target }) => {
      const normalized = normalizePath(target)
      const index = await indexConcepts(ctx.rootDir)
      const candidates = index.entries.filter((e) =>
        e.participants_paths.some((p) => normalizePath(p) === normalized),
      )
      const matches = await Promise.all(
        candidates.map(async (entry) => {
          const parsed = await parseConceptFile(entry.file)
          if (!parsed.concept) return null
          const part = parsed.concept.participants.find(
            (p: { file: string }) => normalizePath(p.file) === normalized,
          )
          if (!part) return null
          return {
            id: entry.id,
            name: entry.name,
            type: entry.type,
            role: part.role,
            purpose: part.purpose,
          }
        }),
      )
      const payload = { matches: matches.filter((m) => m !== null) }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}

