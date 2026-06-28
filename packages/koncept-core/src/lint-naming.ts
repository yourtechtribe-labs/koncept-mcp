/**
 * lint-naming (K4) — DR-1 enforcement: flag NEW uses of a domain concept's
 * forbidden aliases. Two phases, separable on purpose (see DESIGN §4-E):
 *
 *  1. collectNamingCandidates — DETERMINISTIC pre-filter. Regex of each
 *     concept's `naming.forbidden` aliases over the scanned lines. Cheap,
 *     read-only, no LLM, no git. Used by BOTH surfaces (MCP tool + CLI).
 *  2. judgeCandidates — LLM-judge over the grey-zone candidates. Only the CLI
 *     (headless/CI) calls it, via the injected Anthropic seam. Inside an AI
 *     agent the agent IS the judge over the phase-1 candidates → no API key.
 *
 * Pure: no fs, no network, no git. The caller supplies the lines to scan
 * (ADDED diff lines in the CLI — DR-1 is about NEW symbols; working-tree in
 * MCP) and the `llm` provider. Mirrors how checker.ts injects cwd and
 * review.ts injects llm (D-002/D-004: cost/network live in the CLI only).
 *
 * Grounding is structural, not trusted: the judge only ever sees lines WE
 * found (each candidate carries its exact scanned text), so a verdict can
 * never reference a line that isn't in the input. The LLM judges; it does
 * not cite.
 */

import type { Concept } from './schema.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A line to scan: its new-file line number and its text. */
export interface ScannedLine {
  n: number
  text: string
}

/** A file's scannable lines (added diff lines, or whole working-tree file). */
export interface ScannedFile {
  file: string
  lines: ScannedLine[]
}

/** A deterministic hit: a forbidden alias matched a scanned line. Grey zone —
 *  may or may not be a real violation; that's the judge's call (phase 2 / agent). */
export interface LintCandidate {
  conceptId: string
  conceptName: string
  /** First glossary term the concept governs, for remediation context. */
  term: string | null
  canonical: string
  /** The forbidden-alias pattern (as authored) that matched. */
  alias: string
  file: string
  line: number
  /** The exact matched line — the evidence (grounding, not LLM-supplied). */
  text: string
  /** Per-candidate guidance for whoever judges (agent or API). */
  rubric: string
}

export interface LintCandidatesResult {
  candidates: LintCandidate[]
  /** How many concepts carried a `naming` block and were scanned. */
  rulesApplied: number
}

/** A judged candidate. `violation: false` candidates are kept (advisory: the
 *  caller decides whether to surface non-violations as "checked, fine"). */
export interface LintFinding extends LintCandidate {
  violation: boolean
  reason: string
}

export interface NamingVerdict {
  violation: boolean
  reason: string
}

// ─── Phase 1: deterministic candidate collection ───────────────────────────────

function rubricFor(alias: string, canonical: string): string {
  return (
    `Is this line a NEW use of "${alias}" as a domain symbol (an identifier, field, ` +
    `or variable) that should use the canonical "${canonical}" instead? A real ` +
    `violation is a domain symbol. NOT a violation: a comment, a string literal, an ` +
    `unrelated identifier, an external library's own field name, or a different domain ` +
    `that legitimately uses the word.`
  )
}

function compile(src: string): RegExp | null {
  try {
    return new RegExp(src)
  } catch {
    return null
  }
}

/**
 * Scan `files` for any concept's `naming.forbidden` aliases. Pure + deterministic.
 * A concept opts in by carrying a `naming` block (intended for
 * `type: naming-convention` concepts; presence is the signal). Invalid-regex
 * aliases are skipped (author error; advisory tool never throws on input).
 */
export function collectNamingCandidates(
  concepts: Concept[],
  files: ScannedFile[],
): LintCandidatesResult {
  const rules = concepts
    .filter((c) => c.naming !== undefined)
    .map((c) => ({ concept: c, naming: c.naming! }))

  const candidates: LintCandidate[] = []
  for (const { concept, naming } of rules) {
    for (const alias of naming.forbidden) {
      const re = compile(alias)
      if (re === null) continue
      for (const f of files) {
        for (const ln of f.lines) {
          if (!re.test(ln.text)) continue
          candidates.push({
            conceptId: concept.id,
            conceptName: concept.name,
            term: concept.glossary_terms[0] ?? null,
            canonical: naming.canonical,
            alias,
            file: f.file,
            line: ln.n,
            text: ln.text,
            rubric: rubricFor(alias, naming.canonical),
          })
        }
      }
    }
  }
  return { candidates, rulesApplied: rules.length }
}

// ─── Phase 2: LLM-judge (CLI/API surface only) ─────────────────────────────────

export function buildNamingPrompt(c: LintCandidate): string {
  return [
    'You enforce a project naming convention. Decide whether one changed line',
    'violates it by using a prohibited alias for a domain concept.',
    `\nConcept: ${c.conceptName}${c.term !== null ? ` (glossary term: ${c.term})` : ''}`,
    `Canonical name: ${c.canonical}`,
    `Prohibited alias: ${c.alias}`,
    `\nChanged line (${c.file}:${c.line}):\n${c.text}`,
    `\n${c.rubric}`,
    '\nReply with a JSON object {"violation": true | false, "reason": "<1-2 sentences>"}.',
  ].join('\n')
}

/**
 * Lenient parse: prefer an embedded JSON object `{violation, reason}`. If the
 * reply is unparseable, default to NON-violation — an advisory linter must not
 * fabricate a violation from noise (safe default ≠ false alarm).
 */
export function parseNamingVerdict(raw: string): NamingVerdict {
  const text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
      if (typeof obj.violation === 'boolean') {
        const reason =
          typeof obj.reason === 'string' && obj.reason.trim().length > 0
            ? obj.reason.trim()
            : '(no reason provided)'
        return { violation: obj.violation, reason }
      }
    } catch {
      // fall through to safe default
    }
  }
  return { violation: false, reason: 'unparseable model output' }
}

/**
 * Judge each candidate with the injected `llm`. One call per candidate. LLM
 * *errors* propagate (tagged file:line(alias)) so the CLI can exit non-zero;
 * unparseable *replies* coerce to non-violation and continue.
 */
export async function judgeCandidates(
  candidates: LintCandidate[],
  llm: (prompt: string) => Promise<string>,
): Promise<LintFinding[]> {
  const findings: LintFinding[] = []
  for (const c of candidates) {
    let raw: string
    try {
      raw = await llm(buildNamingPrompt(c))
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(`lint-naming judge failed for ${c.file}:${c.line} (${c.alias}): ${detail}`, {
        cause: err,
      })
    }
    const { violation, reason } = parseNamingVerdict(raw)
    findings.push({ ...c, violation, reason })
  }
  return findings
}

// ─── Diff helper: ADDED lines with new-file line numbers ───────────────────────

/**
 * Parse a unified diff into its ADDED lines with accurate new-file line numbers
 * (DR-1 cares about NEW symbols). Reads `@@ -a,b +c,d @@` hunk headers to track
 * the new-file counter; `+`/context lines advance it, `-` lines do not. `+++`
 * file headers and `\ No newline` markers are skipped. Pure string work — the
 * CLI feeds this the output of `git diff`.
 */
export function parseAddedLines(unifiedDiff: string): ScannedLine[] {
  const out: ScannedLine[] = []
  let newLine = 0
  let inHunk = false
  for (const raw of unifiedDiff.split('\n')) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      newLine = parseInt(hunk[1], 10)
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (raw.startsWith('+++')) continue
    if (raw.startsWith('+')) {
      out.push({ n: newLine, text: raw.slice(1) })
      newLine++
      continue
    }
    if (raw.startsWith('-')) continue // removed line: new-file counter unchanged
    if (raw.startsWith('\\')) continue // "\ No newline at end of file"
    newLine++ // context line: advances the new-file counter
  }
  return out
}
