/**
 * Concept loader — the one fs-touching helper that bridges the pure graph
 * functions (computeAffected, runChecks) and the YAML registry on disk.
 *
 * Kept separate from affected.ts so that file stays a pure computation over an
 * already-parsed Concept[] (no glob, no fs). CLI / MCP server call this when
 * they don't already hold a parsed list.
 */

import { glob } from 'glob'
import { parseConceptFile } from './parser.js'
import type { Concept } from './schema.js'

export interface LoadConceptsResult {
  concepts: Concept[]
  parseErrors: Array<{ filePath: string; message: string; field?: string }>
}

const CONCEPTS_GLOB = '.koncept/concepts/*.yaml'

export async function loadConcepts(rootDir: string): Promise<LoadConceptsResult> {
  const files = await glob(CONCEPTS_GLOB, {
    cwd: rootDir,
    absolute: true,
    nodir: true,
    posix: true,
  })
  const parsed = await Promise.all(files.map((f) => parseConceptFile(f)))
  const concepts: Concept[] = []
  const parseErrors: LoadConceptsResult['parseErrors'] = []
  for (const r of parsed) {
    if (r.concept !== null) {
      concepts.push(r.concept)
    } else {
      for (const e of r.errors) {
        parseErrors.push({ filePath: r.filePath, message: e.message, field: e.field })
      }
    }
  }
  return { concepts, parseErrors }
}
