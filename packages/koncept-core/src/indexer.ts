/**
 * Indexer — scan `.koncept/concepts/*.yaml`, parse them, validate cross-refs,
 * and produce a denormalized IndexEntry list.
 *
 * Validations performed:
 *  - YAML/Zod parse errors (collected per-file).
 *  - Duplicate concept ids across files.
 *  - related_concepts pointing to ids that don't exist.
 *  - participants[].file paths that don't resolve on disk.
 */

import { glob } from 'glob'
import { stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseConceptFile, type ParseError } from './parser.js'
import { resolveRelative, normalizeForward } from './paths.js'
import type { Concept, IndexEntry } from './schema.js'

export interface DuplicateId {
  id: string
  files: string[]
}

export interface UnresolvedRelated {
  conceptId: string
  missingRelatedId: string
}

export interface MissingFile {
  conceptId: string
  missingFile: string
}

export interface IndexErrorEntry {
  filePath: string
  errors: ParseError[]
}

export interface IndexResult {
  entries: IndexEntry[]
  errors: IndexErrorEntry[]
  duplicateIds: DuplicateId[]
  unresolvedRelated: UnresolvedRelated[]
  missingFiles: MissingFile[]
}

const CONCEPTS_GLOB = '.koncept/concepts/*.yaml'
const INDEX_FILENAME = '.koncept/index.json'

/**
 * Scan a project root and produce the full index report.
 * @param rootDir absolute or relative path to the project root containing `.koncept/`
 */
export async function indexConcepts(rootDir: string): Promise<IndexResult> {
  // Pass cwd explicitly + posix:true so glob handles forward slashes natively
  // and avoids meta-character escaping issues if rootDir contains `[`, `(`, `*`.
  const files = await glob(CONCEPTS_GLOB, {
    cwd: rootDir,
    absolute: true,
    nodir: true,
    posix: true,
  })

  const result: IndexResult = {
    entries: [],
    errors: [],
    duplicateIds: [],
    unresolvedRelated: [],
    missingFiles: [],
  }

  // Per-file parse + collect concepts (parallel; preserves ordering by source array).
  const parsedAll = await Promise.all(files.map((filePath) => parseConceptFile(filePath)))
  const concepts: Array<{ concept: Concept; filePath: string }> = []
  for (const parsed of parsedAll) {
    if (parsed.concept === null) {
      result.errors.push({ filePath: parsed.filePath, errors: parsed.errors })
      continue
    }
    concepts.push({ concept: parsed.concept, filePath: parsed.filePath })
  }

  const idToFiles = new Map<string, string[]>()
  for (const { concept, filePath } of concepts) {
    const list = idToFiles.get(concept.id) ?? []
    list.push(filePath)
    idToFiles.set(concept.id, list)
  }
  for (const [id, fileList] of idToFiles) {
    if (fileList.length > 1) {
      result.duplicateIds.push({ id, files: fileList })
    }
  }

  // Duplicate ids stay in `knownIds` so related_concepts pointing at them still
  // resolve (the duplicate is reported separately via `duplicateIds`).
  const knownIds = new Set(idToFiles.keys())

  await Promise.all(
    concepts.map(async ({ concept, filePath }) => {
      for (const relatedId of concept.related_concepts) {
        if (!knownIds.has(relatedId)) {
          result.unresolvedRelated.push({
            conceptId: concept.id,
            missingRelatedId: relatedId,
          })
        }
      }
      const participantChecks = await Promise.all(
        concept.participants.map(async (participant) => {
          const abs = resolveRelative(rootDir, participant.file)
          try {
            await stat(abs)
            return null
          } catch {
            return participant.file
          }
        }),
      )
      for (const missing of participantChecks) {
        if (missing !== null) {
          result.missingFiles.push({ conceptId: concept.id, missingFile: missing })
        }
      }
      result.entries.push({
        id: concept.id,
        name: concept.name,
        type: concept.type,
        status: concept.status,
        participants_paths: concept.participants.map((p) => normalizeForward(p.file)),
        tags: concept.tags,
        file: normalizeForward(filePath),
      })
    }),
  )

  return result
}

/**
 * Persist the index to `.koncept/index.json` (gitignored cache).
 */
export async function writeIndex(rootDir: string, entries: IndexEntry[]): Promise<void> {
  const path = join(rootDir, INDEX_FILENAME)
  await writeFile(path, JSON.stringify(entries, null, 2) + '\n', 'utf-8')
}

/**
 * True if the IndexResult is fully clean (no errors of any kind).
 */
export function isIndexClean(result: IndexResult): boolean {
  return (
    result.errors.length === 0 &&
    result.duplicateIds.length === 0 &&
    result.unresolvedRelated.length === 0 &&
    result.missingFiles.length === 0
  )
}
