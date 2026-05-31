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

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CheckOptions {
  /** Repo root — used to locate .koncept/concepts/ AND resolve grep.in paths. */
  cwd: string
  /** If set, only check invariants belonging to this concept id. */
  filterId?: string
}

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'error'

export interface InvariantCheckResult {
  conceptId: string
  invariantId: string
  kind: 'grep' | 'command' | 'none'
  status: CheckStatus
  detail?: string
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
      } else {
        result = executeCommand(concept.id, inv.id, check.cmd, opts.cwd)
      }

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
