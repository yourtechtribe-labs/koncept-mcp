import {
  loadConcepts,
  reviewAffected,
  type ReviewResult,
  type Severity,
} from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'
import { DEFAULT_MODEL, makeAnthropicLlm } from './anthropic-client.js'
import { fileDiff, resolveChangedFiles } from './git.js'

interface ReviewCliOptions {
  rootDir: string
  from: string
  filesOverride: string[] | null
  minSeverity: Severity
  strict: boolean
  model: string
  json: boolean
}

export async function runReview(ctx: CommandContext): Promise<number> {
  const opts = parseOptions(ctx)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey === undefined || apiKey.length === 0) {
    process.stderr.write('koncepto review: ANTHROPIC_API_KEY is required\n')
    return 2
  }

  const filesResult = resolveChangedFiles(opts.rootDir, opts.from, opts.filesOverride)
  if (!filesResult.ok) {
    process.stderr.write(`koncepto review: ${filesResult.error}\n`)
    return 2
  }

  const loaded = await loadConcepts(opts.rootDir)
  if (loaded.parseErrors.length > 0 && !opts.json) {
    for (const e of loaded.parseErrors) {
      process.stderr.write(`koncepto review: warning: parse error in ${e.filePath}: ${e.message}\n`)
    }
  }

  let result: ReviewResult
  try {
    result = await reviewAffected(loaded.concepts, {
      rootDir: opts.rootDir,
      changedFiles: filesResult.files,
      diff: (file) => fileDiff(opts.rootDir, opts.from, file),
      minSeverity: opts.minSeverity,
      llm: makeAnthropicLlm(apiKey, opts.model),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    process.stderr.write(`koncepto review: ${detail}\n`)
    return 2
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    renderReview(result)
  }

  return exitCodeFor(result, opts.strict)
}

const SEVERITIES: readonly Severity[] = ['high', 'medium', 'low']

function parseOptions(ctx: CommandContext): ReviewCliOptions {
  const filesFlag = ctx.flags.files
  const filesOverride =
    typeof filesFlag === 'string'
      ? filesFlag.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : null
  const sevFlag = ctx.flags.severity
  const minSeverity =
    typeof sevFlag === 'string' && SEVERITIES.includes(sevFlag as Severity)
      ? (sevFlag as Severity)
      : 'medium'
  return {
    rootDir: ctx.rootDir,
    from: typeof ctx.flags.from === 'string' ? ctx.flags.from : 'HEAD',
    filesOverride,
    minSeverity,
    strict: ctx.flags.strict === true,
    model: typeof ctx.flags.model === 'string' ? ctx.flags.model : DEFAULT_MODEL,
    json: ctx.flags.json === true,
  }
}

const VERDICT_SYMBOL: Record<string, string> = { holds: '✓', violated: '✗', uncertain: '?' }

function renderReview(result: ReviewResult): void {
  process.stdout.write(
    `koncepto review — ${result.reviews.length} advisory invariant(s), ${result.skipped} skipped\n`,
  )
  for (const r of result.reviews) {
    process.stdout.write(`\n  ${r.conceptId} / ${r.invariantId} [${r.severity}]\n`)
    process.stdout.write(`    ${VERDICT_SYMBOL[r.verdict] ?? '?'} ${r.verdict} — ${r.rationale}\n`)
  }
  process.stdout.write(
    `\n  Results: ${result.holds} holds · ${result.violated} violated · ${result.uncertain} uncertain · ${result.skipped} skipped\n`,
  )
}

/** Advisory by default (exit 0). --strict gates on `violated`; uncertain never fails. */
function exitCodeFor(result: ReviewResult, strict: boolean): number {
  return strict && result.violated > 0 ? 1 : 0
}
