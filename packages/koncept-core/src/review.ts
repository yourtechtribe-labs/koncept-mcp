/**
 * Semantic invariant review (Phase 2) — for each touched ADVISORY invariant,
 * ask an injected LLM whether the change still upholds it. Pure: the LLM
 * provider and the per-file diff are injected by the CLI (mirrors how
 * checker.ts injects cwd), so unit tests run with a fake llm and no network.
 *
 * Boundary (D-002 / D-004): network + cost live in the CLI, never the MCP
 * server. This module only shapes prompts and tallies verdicts.
 */

import { computeAffected, type AffectedConcept, type AffectedInvariant } from './affected.js'
import type { Concept, Severity } from './schema.js'

export type Verdict = 'holds' | 'violated' | 'uncertain'

const VERDICTS: readonly Verdict[] = ['holds', 'violated', 'uncertain']
const NO_RATIONALE = '(no rationale provided)'
const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 }

export interface InvariantReview {
  conceptId: string
  invariantId: string
  severity: Severity
  verdict: Verdict
  rationale: string
  files: string[]
}

export interface ReviewResult {
  reviews: InvariantReview[]
  holds: number
  violated: number
  uncertain: number
  /** automated invariants + advisory invariants below --severity */
  skipped: number
}

export interface ReviewOptions {
  rootDir: string
  changedFiles: string[]
  /** Injected: unified diff text for a single file (sync, like spawnSync). */
  diff: (file: string) => string
  minSeverity: Severity
  /** Injected provider: prompt → raw model text. Throws propagate (→ exit 2). */
  llm: (prompt: string) => Promise<string>
}

// ─── Verdict parsing ────────────────────────────────────────────────────────

/**
 * Lenient parse of the model's reply: prefer an embedded JSON object
 * `{verdict, rationale}`; fall back to scanning prose for a verdict keyword;
 * otherwise coerce to `uncertain` (never throws — unparseable ≠ failure).
 */
export function parseVerdict(raw: string): { verdict: Verdict; rationale: string } {
  const text = raw.trim()
  const fromJson = verdictFromJson(text)
  if (fromJson) return fromJson
  const scanned = text.match(/\b(holds|violated|uncertain)\b/)
  if (scanned) return { verdict: scanned[1] as Verdict, rationale: truncate(text) }
  return { verdict: 'uncertain', rationale: 'unparseable model output' }
}

function verdictFromJson(text: string): { verdict: Verdict; rationale: string } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.verdict !== 'string' || !VERDICTS.includes(obj.verdict as Verdict)) {
    return null
  }
  const rationale =
    typeof obj.rationale === 'string' && obj.rationale.trim().length > 0
      ? obj.rationale.trim()
      : NO_RATIONALE
  return { verdict: obj.verdict as Verdict, rationale }
}

function truncate(s: string, max = 300): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ─── Review orchestration ─────────────────────────────────────────────────────

/**
 * For each ADVISORY invariant touched by the diff and at/above `minSeverity`,
 * one LLM call judges whether the change still upholds it. Automated and
 * below-threshold invariants are counted in `skipped`. LLM *errors* propagate
 * (tagged `concept:invariant`) so the CLI can exit 2; unparseable *replies*
 * are coerced to `uncertain` and continue.
 */
export async function reviewAffected(
  concepts: Concept[],
  opts: ReviewOptions,
): Promise<ReviewResult> {
  const report = computeAffected(concepts, opts.changedFiles)
  const reviews: InvariantReview[] = []
  let skipped = 0

  for (const affected of report.concepts) {
    const files = affected.matched_files.map((m) => m.file)
    for (const inv of affected.invariants) {
      if (!isReviewable(inv, opts.minSeverity)) {
        skipped++
        continue
      }
      reviews.push(await reviewOne(affected, inv, files, opts))
    }
  }

  return tally(reviews, skipped)
}

function isReviewable(inv: AffectedInvariant, minSeverity: Severity): boolean {
  return inv.klass === 'advisory' && SEVERITY_RANK[inv.severity] >= SEVERITY_RANK[minSeverity]
}

async function reviewOne(
  affected: AffectedConcept,
  inv: AffectedInvariant,
  files: string[],
  opts: ReviewOptions,
): Promise<InvariantReview> {
  const prompt = buildPrompt(affected, inv, files, opts.diff)
  let raw: string
  try {
    raw = await opts.llm(prompt)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`review failed for ${inv.concept_id}:${inv.invariant_id}: ${detail}`)
  }
  const { verdict, rationale } = parseVerdict(raw)
  return {
    conceptId: inv.concept_id,
    invariantId: inv.invariant_id,
    severity: inv.severity,
    verdict,
    rationale,
    files,
  }
}

export function buildPrompt(
  affected: AffectedConcept,
  inv: AffectedInvariant,
  files: string[],
  diff: (file: string) => string,
): string {
  const diffs = files.map((f) => `--- ${f} ---\n${diff(f)}`).join('\n\n')
  return [
    'You are reviewing whether a code change still upholds a documented semantic invariant.',
    `\nConcept: ${affected.name}\n${affected.type}`,
    `\nInvariant (${inv.severity}): ${inv.description}`,
    `\nChanged files:\n${diffs}`,
    '\nDoes the change uphold the invariant? Reply with a JSON object',
    '{"verdict": "holds" | "violated" | "uncertain", "rationale": "<1-3 sentences>"}.',
  ].join('\n')
}

function tally(reviews: InvariantReview[], skipped: number): ReviewResult {
  let holds = 0
  let violated = 0
  let uncertain = 0
  for (const r of reviews) {
    if (r.verdict === 'holds') holds++
    else if (r.verdict === 'violated') violated++
    else uncertain++
  }
  return { reviews, holds, violated, uncertain, skipped }
}
