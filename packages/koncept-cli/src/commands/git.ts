/**
 * Git helpers shared by `affected` and `review` — the diff resolution both
 * commands need. `git diff --name-only -z` is NUL-terminated (so paths with
 * spaces survive); splitting on space silently matched nothing.
 */

import { spawnSync } from 'node:child_process'

export interface ChangedFilesResult {
  ok: boolean
  files: string[]
  error: string
}

export function resolveChangedFiles(
  rootDir: string,
  from: string,
  filesOverride: string[] | null,
): ChangedFilesResult {
  if (filesOverride !== null) {
    return { ok: true, files: filesOverride, error: '' }
  }
  const result = spawnSync('git', ['diff', '--name-only', '-z', from], {
    cwd: rootDir,
    encoding: 'buffer',
  })
  if (result.error) {
    return { ok: false, files: [], error: `git invocation failed: ${result.error.message}` }
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString('utf-8').trim() : ''
    return {
      ok: false,
      files: [],
      error: `git diff exited with status ${result.status}${stderr ? `: ${stderr}` : ''}`,
    }
  }
  const stdout = result.stdout ? result.stdout.toString('utf-8') : ''
  const files = stdout.split('\0').filter((s) => s.length > 0)
  return { ok: true, files, error: '' }
}

/** Unified diff for one file against `from` (sync — the injected `diff` seam). */
export function fileDiff(rootDir: string, from: string, file: string): string {
  const result = spawnSync('git', ['diff', from, '--', file], {
    cwd: rootDir,
    encoding: 'utf-8',
  })
  if (result.error) {
    throw new Error(`git diff failed for ${file}: ${result.error.message}`)
  }
  return result.stdout ?? ''
}
