import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  AutomatedCheckSchema,
  ConceptTypeEnum,
  RoleEnum,
  SeverityEnum,
  computeAffected,
  loadConcepts,
} from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'

const MatchedRoleEnum = z.union([RoleEnum, z.literal('source_of_truth')])

const inputSchema = {
  files: z
    .array(z.string().min(1))
    .min(1)
    .describe('Changed file paths (forward-slash, repo-relative). Caller supplies the diff.'),
}

const outputSchema = {
  changed_files: z.array(z.string()),
  concepts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: ConceptTypeEnum,
      max_severity: SeverityEnum.nullable(),
      matched_files: z.array(
        z.object({ file: z.string(), role: MatchedRoleEnum }),
      ),
      other_participants: z.array(z.string()),
      invariants: z.array(
        z.object({
          concept_id: z.string(),
          concept_name: z.string(),
          invariant_id: z.string(),
          description: z.string(),
          severity: SeverityEnum,
          check: AutomatedCheckSchema,
          klass: z.enum(['automated', 'advisory']),
          acknowledged: z.boolean().optional(),
        }),
      ),
    }),
  ),
  unmatched_files: z.array(z.string()),
  summary: z.object({
    automated: z.number(),
    advisory: z.number(),
    advisory_high: z.number(),
    unacknowledged_high: z.number(),
  }),
}

export function registerKonceptAffected(mcp: McpServer, ctx: ToolContext): void {
  mcp.registerTool(
    'koncept_affected',
    {
      title: 'Affected concepts and invariants',
      description:
        'Given a list of changed file paths, return the concepts and invariants touched by those files. Use this BEFORE editing or reviewing a diff to surface the invariants the change must respect. Concepts are ordered by max severity (high first).',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ files }) => {
      const loaded = await loadConcepts(ctx.rootDir)
      const report = computeAffected(loaded.concepts, files)
      const payload = {
        changed_files: report.changed_files,
        concepts: report.concepts,
        unmatched_files: report.unmatched_files,
        summary: report.summary,
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}
