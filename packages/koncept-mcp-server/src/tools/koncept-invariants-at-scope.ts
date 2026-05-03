import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { indexConcepts, parseConceptFile } from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'

const KEBAB_ID_REGEX = /^[a-z][a-z0-9-]+$/

export function registerKonceptInvariantsAtScope(
  mcp: McpServer,
  ctx: ToolContext,
): void {
  mcp.registerTool(
    'koncept_invariants_at_scope',
    {
      description:
        'List invariants that apply within a scope. Scope can be a file path or a concept id (kebab-case).',
      inputSchema: { scope: z.string().min(1) },
    },
    async ({ scope }) => {
      const index = await indexConcepts(ctx.rootDir)
      const isConceptId = KEBAB_ID_REGEX.test(scope)
      const target = isConceptId ? null : normalizePath(scope)

      const conceptsToInspect = isConceptId
        ? index.entries.filter((e) => e.id === scope)
        : index.entries.filter((e) =>
            e.participants_paths.some((p) => normalizePath(p) === target),
          )

      const invariants: Array<{
        concept_id: string
        invariant_id: string
        description: string
        severity: string
        source_file: string
      }> = []

      const parsedAll = await Promise.all(
        conceptsToInspect.map((e) => parseConceptFile(e.file)),
      )
      parsedAll.forEach((parsed, i) => {
        if (!parsed.concept) return
        const concept = parsed.concept
        for (const inv of concept.invariants) {
          invariants.push({
            concept_id: concept.id,
            invariant_id: inv.id,
            description: inv.description,
            severity: inv.severity,
            source_file: conceptsToInspect[i].file,
          })
        }
      })

      const payload = { invariants }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}
