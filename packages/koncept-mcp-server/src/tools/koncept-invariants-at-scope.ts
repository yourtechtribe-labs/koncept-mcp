import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  SeverityEnum,
  indexConcepts,
  parseConceptFile,
} from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'
import { KEBAB_ID_REGEX, normalizePath } from './_shared.js'

const inputSchema = { scope: z.string().min(1) }

const outputSchema = {
  invariants: z.array(
    z.object({
      concept_id: z.string(),
      invariant_id: z.string(),
      description: z.string(),
      severity: SeverityEnum,
      source_file: z.string(),
    }),
  ),
}

export function registerKonceptInvariantsAtScope(
  mcp: McpServer,
  ctx: ToolContext,
): void {
  mcp.registerTool(
    'koncept_invariants_at_scope',
    {
      title: 'Invariants at scope',
      description:
        'List invariants that apply within a scope. Scope can be a file path or a concept id (kebab-case).',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
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

      const parsedAll = await Promise.all(
        conceptsToInspect.map((e) => parseConceptFile(e.file)),
      )
      const invariants = parsedAll.flatMap((parsed, i) => {
        if (!parsed.concept) return []
        const concept = parsed.concept
        const sourceFile = conceptsToInspect[i].file
        return concept.invariants.map((inv) => ({
          concept_id: concept.id,
          invariant_id: inv.id,
          description: inv.description,
          severity: inv.severity,
          source_file: sourceFile,
        }))
      })

      const payload = { invariants }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}

