import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  collectNamingCandidates,
  loadConcepts,
  type ScannedFile,
} from '@yourtechtribe-labs/koncept-core'
import type { ToolContext } from './index.js'

/**
 * koncept_lint_naming (K4, MCP surface — DESIGN §4-E).
 *
 * Read-only (D-002): runs ONLY the deterministic pre-filter — regex of each
 * concept's `naming.forbidden` aliases over the working-tree content of the
 * given files. It does NOT call any LLM and does NOT touch the network. The
 * host AI agent is the judge: it reads these candidates (with the diff it
 * already has) and decides which are real violations vs incidental matches.
 * The Anthropic-API judge lives only in the CLI (`koncepto lint-naming`).
 */

const inputSchema = {
  files: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Changed file paths (forward-slash, repo-relative) to scan for prohibited naming aliases.',
    ),
}

const outputSchema = {
  candidates: z.array(
    z.object({
      concept_id: z.string(),
      concept_name: z.string(),
      term: z.string().nullable(),
      canonical: z.string(),
      alias: z.string(),
      file: z.string(),
      line: z.number(),
      text: z.string(),
      rubric: z.string(),
    }),
  ),
  rules_applied: z.number(),
  unreadable_files: z.array(z.string()),
  note: z.string(),
}

const AGENT_NOTE =
  'Deterministic pre-filter only. YOU are the judge: for each candidate, decide ' +
  'whether the line is a real NEW use of the prohibited alias as a domain symbol ' +
  '(→ violation, use the canonical) or an incidental match (comment, string, ' +
  "unrelated identifier, external library field, different domain). Use the diff you " +
  'already have to tell new from pre-existing.'

export function registerKonceptLintNaming(mcp: McpServer, ctx: ToolContext): void {
  mcp.registerTool(
    'koncept_lint_naming',
    {
      title: 'Naming-alias candidates (DR-1 pre-filter)',
      description:
        'Given changed file paths, return lines that use a concept\'s prohibited naming alias ' +
        '(deterministic regex pre-filter over the working tree). No LLM, no network: the calling ' +
        'agent judges which candidates are real violations. Use when reviewing a diff for ' +
        'domain-vocabulary drift.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ files }) => {
      const loaded = await loadConcepts(ctx.rootDir)

      const scanned: ScannedFile[] = []
      const unreadable: string[] = []
      for (const file of files) {
        try {
          const content = readFileSync(join(ctx.rootDir, file), 'utf-8')
          const lines = content.split('\n').map((text, i) => ({ n: i + 1, text }))
          scanned.push({ file, lines })
        } catch {
          unreadable.push(file)
        }
      }

      const { candidates, rulesApplied } = collectNamingCandidates(loaded.concepts, scanned)
      const payload = {
        candidates: candidates.map((c) => ({
          concept_id: c.conceptId,
          concept_name: c.conceptName,
          term: c.term,
          canonical: c.canonical,
          alias: c.alias,
          file: c.file,
          line: c.line,
          text: c.text,
          rubric: c.rubric,
        })),
        rules_applied: rulesApplied,
        unreadable_files: unreadable,
        note: AGENT_NOTE,
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      }
    },
  )
}
