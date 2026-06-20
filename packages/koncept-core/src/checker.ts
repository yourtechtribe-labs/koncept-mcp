/**
 * checker — executes invariant.check payloads (grep | command | none).
 *
 * Lives in koncept-core so it can be tested independently of the CLI.
 * Uses node:fs (reads) and node:child_process (command kind) — no writes
 * to .koncept/ (D-002 invariant preserved).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConcepts } from './load-concepts.js'
import type { Concept, Participant, ParticipantSelector } from './schema.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CheckOptions {
  /** Repo root — used to locate .koncept/concepts/ AND resolve participant/grep paths. */
  cwd: string
  /** If set, only check invariants belonging to this concept id. */
  filterId?: string
  /**
   * If true, `kind: command` invariants are skipped (status 'skip') instead of
   * executed. The static kinds (grep, implication, symbol_present, forbidden)
   * still run. Used by `koncepto verify` so the default gate stays hook-safe
   * (no arbitrary shell). Default false — `koncepto check` runs everything.
   */
  staticOnly?: boolean
}

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'error'

export type CheckKind = 'none' | 'grep' | 'command' | 'implication' | 'symbol_present' | 'forbidden'

export interface InvariantCheckResult {
  conceptId: string
  invariantId: string
  kind: CheckKind
  status: CheckStatus
  detail?: string
  /** The invariant description — surfaced as a remediation hint in verify output. */
  description?: string
}

export interface CheckResult {
  results: InvariantCheckResult[]
  passed: number
  failed: number
  /** kind: none invariants — never a failure */
  skipped: number
  /** Infrastructure failures (file not found, spawn error, invalid regex) */
  errors: number
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runChecks(opts: CheckOptions): Promise<CheckResult> {
  const loaded = await loadConcepts(opts.cwd)
  let concepts = loaded.concepts

  if (opts.filterId !== undefined) {
    const found = concepts.find((c) => c.id === opts.filterId)
    if (!found) {
      return {
        results: [
          {
            conceptId: opts.filterId,
            invariantId: '(concept)',
            kind: 'none',
            status: 'error',
            detail: `concept not found: ${opts.filterId}`,
          },
        ],
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 1,
      }
    }
    concepts = [found]
  }

  const results: InvariantCheckResult[] = []

  for (const concept of concepts) {
    for (const inv of concept.invariants) {
      const check = inv.check
      let result: InvariantCheckResult

      if (check.kind === 'none') {
        result = { conceptId: concept.id, invariantId: inv.id, kind: 'none', status: 'skip' }
      } else if (check.kind === 'grep') {
        result = executeGrep(
          concept.id,
          inv.id,
          check.pattern,
          check.in,
          check.should_match,
          opts.cwd,
        )
      } else if (check.kind === 'implication') {
        result = executeImplication(concept, inv.id, check.over, check.if, check.then, opts.cwd)
      } else if (check.kind === 'symbol_present') {
        result = executePresence(concept, inv.id, 'symbol_present', check.over, check.pattern, opts.cwd)
      } else if (check.kind === 'forbidden') {
        result = executePresence(concept, inv.id, 'forbidden', check.over, check.pattern, opts.cwd)
      } else if (opts.staticOnly === true) {
        // kind: command — never run by the static gate (verify). Skip, don't execute.
        result = { conceptId: concept.id, invariantId: inv.id, kind: 'command', status: 'skip' }
      } else {
        result = executeCommand(concept.id, inv.id, check.cmd, opts.cwd)
      }

      // Surface the invariant description as a remediation hint on every result.
      result.description = inv.description
      results.push(result)
    }
  }

  return tally(results)
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function executeGrep(
  conceptId: string,
  invariantId: string,
  pattern: string,
  files: string[],
  shouldMatch: boolean,
  cwd: string,
): InvariantCheckResult {
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch {
    return {
      conceptId,
      invariantId,
      kind: 'grep',
      status: 'error',
      detail: `invalid regex: ${pattern}`,
    }
  }

  const matchedFiles: string[] = []

  for (const rel of files) {
    const abs = join(cwd, rel)
    let content: string
    try {
      content = readFileSync(abs, 'utf-8')
    } catch {
      return {
        conceptId,
        invariantId,
        kind: 'grep',
        status: 'error',
        detail: `file not found: ${rel}`,
      }
    }
    if (regex.test(content)) {
      matchedFiles.push(rel)
    }
  }

  const anyMatch = matchedFiles.length > 0

  if (shouldMatch && anyMatch) {
    return { conceptId, invariantId, kind: 'grep', status: 'pass' }
  }
  if (!shouldMatch && !anyMatch) {
    return { conceptId, invariantId, kind: 'grep', status: 'pass' }
  }

  // Failure
  const detail = shouldMatch
    ? `pattern '${pattern}' not found in: ${files.join(', ')}`
    : `pattern '${pattern}' found in: ${matchedFiles.join(', ')}`
  return { conceptId, invariantId, kind: 'grep', status: 'fail', detail }
}

function executeCommand(
  conceptId: string,
  invariantId: string,
  cmd: string,
  cwd: string,
): InvariantCheckResult {
  const result = spawnSync(cmd, {
    cwd,
    shell: true,
    timeout: 30_000,
    encoding: 'utf-8',
  })

  if (result.error) {
    return {
      conceptId,
      invariantId,
      kind: 'command',
      status: 'error',
      detail: result.error.message,
    }
  }

  if (result.status === 0) {
    return { conceptId, invariantId, kind: 'command', status: 'pass' }
  }

  const raw = ((result.stdout ?? '') + (result.stderr ?? '')).trim()
  const detail = raw.length > 500 ? raw.slice(0, 500) + '…' : raw
  return { conceptId, invariantId, kind: 'command', status: 'fail', detail }
}

// ─── #36 static enforcement helpers ─────────────────────────────────────────

/** Filter a concept's declared participants by an optional `over` selector.
 *  No filesystem glob — pure filter over the known list (cheap, hook-safe). */
function selectParticipants(concept: Concept, over?: ParticipantSelector): Participant[] {
  if (over?.role === undefined) return concept.participants
  return concept.participants.filter((p) => p.role === over.role)
}

/** Compile a RegExp source; returns null on invalid pattern. */
function compileRegex(src: string): RegExp | null {
  try {
    return new RegExp(src)
  } catch {
    return null
  }
}

/** Reads each selected participant. Returns either the [file, content] pairs or
 *  an early error result (empty selection, missing file). */
function readSelected(
  concept: Concept,
  invariantId: string,
  kind: CheckKind,
  over: ParticipantSelector | undefined,
  cwd: string,
): { files: Array<[string, string]> } | { error: InvariantCheckResult } {
  const selected = selectParticipants(concept, over)
  if (selected.length === 0) {
    return {
      error: {
        conceptId: concept.id,
        invariantId,
        kind,
        status: 'error',
        detail: 'no participants match selector',
      },
    }
  }
  const files: Array<[string, string]> = []
  for (const p of selected) {
    try {
      files.push([p.file, readFileSync(join(cwd, p.file), 'utf-8')])
    } catch {
      return {
        error: {
          conceptId: concept.id,
          invariantId,
          kind,
          status: 'error',
          detail: `file not found: ${p.file}`,
        },
      }
    }
  }
  return { files }
}

/** Builds an InvariantCheckResult for a fixed concept/invariant/kind. The execute*
 *  helpers close over this so each return is just `(status, detail?)`. */
function resultFor(concept: Concept, invariantId: string, kind: CheckKind) {
  return (status: CheckStatus, detail?: string): InvariantCheckResult => ({
    conceptId: concept.id,
    invariantId,
    kind,
    status,
    detail,
  })
}

function executeImplication(
  concept: Concept,
  invariantId: string,
  over: ParticipantSelector | undefined,
  ifSrc: string,
  thenSrc: string,
  cwd: string,
): InvariantCheckResult {
  const r = resultFor(concept, invariantId, 'implication')

  const reIf = compileRegex(ifSrc)
  const reThen = compileRegex(thenSrc)
  if (reIf === null || reThen === null) {
    return r('error', `invalid regex: ${reIf === null ? ifSrc : thenSrc}`)
  }

  const read = readSelected(concept, invariantId, 'implication', over, cwd)
  if ('error' in read) return read.error

  const offenders = read.files
    .filter(([, content]) => reIf.test(content) && !reThen.test(content))
    .map(([file]) => file)

  return offenders.length === 0
    ? r('pass')
    : r('fail', `matches /${ifSrc}/ but not /${thenSrc}/ in: ${offenders.join(', ')}`)
}

/** Shared per-file presence/absence evaluator for symbol_present | forbidden. */
function executePresence(
  concept: Concept,
  invariantId: string,
  kind: 'symbol_present' | 'forbidden',
  over: ParticipantSelector | undefined,
  pattern: string,
  cwd: string,
): InvariantCheckResult {
  const r = resultFor(concept, invariantId, kind)

  const re = compileRegex(pattern)
  if (re === null) return r('error', `invalid regex: ${pattern}`)

  const read = readSelected(concept, invariantId, kind, over, cwd)
  if ('error' in read) return read.error

  // symbol_present: offender = file MISSING the pattern. forbidden: offender = file WITH it.
  const wantPresent = kind === 'symbol_present'
  const offenders = read.files
    .filter(([, content]) => re.test(content) !== wantPresent)
    .map(([file]) => file)

  if (offenders.length === 0) return r('pass')
  const verb = wantPresent ? 'missing in' : 'present in'
  return r('fail', `pattern '${pattern}' ${verb}: ${offenders.join(', ')}`)
}

function tally(results: InvariantCheckResult[]): CheckResult {
  let passed = 0
  let failed = 0
  let skipped = 0
  let errors = 0
  for (const r of results) {
    if (r.status === 'pass') passed++
    else if (r.status === 'fail') failed++
    else if (r.status === 'skip') skipped++
    else errors++
  }
  return { results, passed, failed, skipped, errors }
}
