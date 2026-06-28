/**
 * `koncepto lint-naming` — headless/CI surface of K4 (DESIGN §4-E).
 *
 * Deterministic pre-filter (collectNamingCandidates over the diff's ADDED
 * lines) → LLM-judge via the Anthropic seam (key) → advisory by default;
 * `--strict` gates on a real violation. Inside an AI agent you DON'T use this
 * command: the MCP tool `koncept_lint_naming` returns the candidates and the
 * agent judges them with its own LLM (no key).
 */

import {
  loadConcepts,
  collectNamingCandidates,
  judgeCandidates,
  parseAddedLines,
  type LintFinding,
  type ScannedFile,
} from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'
import { DEFAULT_MODEL, makeAnthropicLlm } from './anthropic-client.js'
import { fileDiff, resolveChangedFiles } from './git.js'

interface LintCliOptions {
  rootDir: string
  from: string
  filesOverride: string[] | null
  strict: boolean
  model: string
  json: boolean
}

export async function runLintNaming(ctx: CommandContext): Promise<number> {
  const opts = parseOptions(ctx)

  const filesResult = resolveChangedFiles(opts.rootDir, opts.from, opts.filesOverride)
  if (!filesResult.ok) {
    process.stderr.write(`koncepto lint-naming: ${filesResult.error}\n`)
    return 2
  }

  const loaded = await loadConcepts(opts.rootDir)
  if (loaded.parseErrors.length > 0 && !opts.json) {
    for (const e of loaded.parseErrors) {
      process.stderr.write(
        `koncepto lint-naming: warning: parse error in ${e.filePath}: ${e.message}\n`,
      )
    }
  }

  // Build the scan set from the ADDED lines of each changed file (DR-1 = NEW
  // symbols). git is read here, not in core (core stays pure).
  const scanned: ScannedFile[] = []
  for (const file of filesResult.files) {
    const lines = parseAddedLines(fileDiff(opts.rootDir, opts.from, file))
    if (lines.length > 0) scanned.push({ file, lines })
  }

  const { candidates, rulesApplied } = collectNamingCandidates(loaded.concepts, scanned)

  // No naming rules, or nothing matched → nothing for the LLM (cost 0).
  if (candidates.length === 0) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ findings: [], violations: 0, candidates: 0, rulesApplied }, null, 2) + '\n',
      )
    } else {
      process.stdout.write(
        `koncepto lint-naming — ${rulesApplied} naming rule(s), 0 candidates in the diff\n`,
      )
    }
    return 0
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey === undefined || apiKey.length === 0) {
    process.stderr.write(
      'koncepto lint-naming: ANTHROPIC_API_KEY is required to judge candidates ' +
        '(or use the koncept_lint_naming MCP tool inside an AI agent)\n',
    )
    return 2
  }

  let findings: LintFinding[]
  try {
    findings = await judgeCandidates(candidates, makeAnthropicLlm(apiKey, opts.model))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    process.stderr.write(`koncepto lint-naming: ${detail}\n`)
    return 2
  }

  const violations = findings.filter((f) => f.violation)

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { findings, violations: violations.length, candidates: candidates.length, rulesApplied },
        null,
        2,
      ) + '\n',
    )
  } else {
    renderFindings(findings, violations.length, rulesApplied)
  }

  // Advisory by default (exit 0). --strict gates on a real violation.
  return opts.strict && violations.length > 0 ? 1 : 0
}

function parseOptions(ctx: CommandContext): LintCliOptions {
  const filesFlag = ctx.flags.files
  const filesOverride =
    typeof filesFlag === 'string'
      ? filesFlag.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : null
  return {
    rootDir: ctx.rootDir,
    from: typeof ctx.flags.from === 'string' ? ctx.flags.from : 'HEAD',
    filesOverride,
    strict: ctx.flags.strict === true,
    model: typeof ctx.flags.model === 'string' ? ctx.flags.model : DEFAULT_MODEL,
    json: ctx.flags.json === true,
  }
}

function renderFindings(findings: LintFinding[], violations: number, rulesApplied: number): void {
  process.stdout.write(
    `koncepto lint-naming — ${rulesApplied} naming rule(s), ${findings.length} candidate(s) judged\n`,
  )
  for (const f of findings.filter((x) => x.violation)) {
    const term = f.term !== null ? ` «${f.term}»` : ''
    process.stdout.write(`\n  ✗ ${f.file}:${f.line} — '${f.alias}' → use '${f.canonical}'${term}\n`)
    process.stdout.write(`    ${f.text.trim()}\n`)
    process.stdout.write(`    ${f.reason}\n`)
  }
  process.stdout.write(`\n  Results: ${violations} violation(s) of ${findings.length} candidate(s)\n`)
}
