/**
 * Acknowledgment resolution for `koncepto affected --require-ack`.
 *
 * Two sources, unioned: (1) commit trailers `Koncepto-Reviewed: <c>:<i>` in the
 * `<from>..HEAD` range (CI-friendly audit trail), (2) the `--ack` csv flag
 * (local override). Pure parsers are exported for unit tests; `gatherAcks`
 * wires the git invocation (the one side effect).
 *
 * Range note: default `--from HEAD` ⇒ empty range ⇒ no trailer acks (only
 * `--ack` applies). `--files` override ⇒ no git range ⇒ `--ack` only.
 */

import { spawnSync } from 'node:child_process'

const TRAILER_KEY = 'Koncepto-Reviewed'

export type AckCsvResult =
  | { ok: true; keys: string[] }
  | { ok: false; bad: string }

/** Parses the `--ack` csv into ack keys; fails on an entry missing a colon. */
export function parseAckCsv(csv: string): AckCsvResult {
  const keys: string[] = []
  for (const raw of csv.split(',')) {
    const entry = raw.trim()
    if (entry.length === 0) continue
    if (!entry.includes(':')) return { ok: false, bad: entry }
    keys.push(entry)
  }
  return { ok: true, keys }
}

/** Extracts ack keys from `git log` trailer output (one value per line). */
export function parseReviewedTrailers(gitOutput: string): string[] {
  return gitOutput
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes(':'))
}

export interface GatherAcksOptions {
  rootDir: string
  from: string
  /** When false (e.g. --files override), skip the git range entirely. */
  useGit: boolean
  ackCsv: string | null
}

export type GatherAcksResult =
  | { ok: true; acks: ReadonlySet<string> }
  | { ok: false; error: string }

export function gatherAcks(opts: GatherAcksOptions): GatherAcksResult {
  const acks = new Set<string>()

  if (opts.ackCsv !== null) {
    const parsed = parseAckCsv(opts.ackCsv)
    if (!parsed.ok) {
      return {
        ok: false,
        error: `invalid --ack entry: '${parsed.bad}' (want concept-id:invariant-id)`,
      }
    }
    for (const k of parsed.keys) acks.add(k)
  }

  if (opts.useGit) {
    const fromTrailers = trailersFromGit(opts.rootDir, opts.from)
    if (!fromTrailers.ok) return fromTrailers
    for (const k of fromTrailers.keys) acks.add(k)
  }

  return { ok: true, acks }
}

function trailersFromGit(
  rootDir: string,
  from: string,
): { ok: true; keys: string[] } | { ok: false; error: string } {
  const result = spawnSync(
    'git',
    ['log', `${from}..HEAD`, `--format=%(trailers:key=${TRAILER_KEY},valueonly)`],
    { cwd: rootDir, encoding: 'utf-8' },
  )
  if (result.error) {
    return { ok: false, error: `git invocation failed: ${result.error.message}` }
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim()
    return {
      ok: false,
      error: `git log exited with status ${result.status}${stderr ? `: ${stderr}` : ''}`,
    }
  }
  return { ok: true, keys: parseReviewedTrailers(result.stdout ?? '') }
}
