/**
 * Fuzzy search over IndexEntry list.
 *
 * Score model (0-1, higher = better match):
 *   1.0  exact id match
 *   0.9  exact tag match
 *   0.7  case-insensitive substring in id
 *   0.6  case-insensitive substring in name
 *   0.5  case-insensitive substring in tag
 *
 * Exact matches return early; fuzzy substring scores accumulate.
 */

import type { IndexEntry } from './schema.js'

export type MatchField = 'id' | 'name' | 'tags'

export interface SearchHit {
  entry: IndexEntry
  score: number
  matchedOn: MatchField[]
}

const DEFAULT_LIMIT = 10

interface LoweredEntry {
  entry: IndexEntry
  idLower: string
  nameLower: string
  tagsLower: string[]
}

// Memoize lowercased projections per entries-array reference. Avoids re-allocating
// O(N×tags) strings on every search call when the same index is queried repeatedly.
const loweredCache = new WeakMap<IndexEntry[], LoweredEntry[]>()

function getLowered(entries: IndexEntry[]): LoweredEntry[] {
  const cached = loweredCache.get(entries)
  if (cached) return cached
  const projected = entries.map((entry) => ({
    entry,
    idLower: entry.id.toLowerCase(),
    nameLower: entry.name.toLowerCase(),
    tagsLower: entry.tags.map((t) => t.toLowerCase()),
  }))
  loweredCache.set(entries, projected)
  return projected
}

function scoreEntry(lowered: LoweredEntry, q: string): SearchHit | null {
  const { entry, idLower, nameLower, tagsLower } = lowered

  if (idLower === q) {
    return { entry, score: 1.0, matchedOn: ['id'] }
  }
  if (tagsLower.includes(q)) {
    return { entry, score: 0.9, matchedOn: ['tags'] }
  }

  let score = 0
  const matchedOn: MatchField[] = []

  if (idLower.includes(q)) {
    score += 0.7
    matchedOn.push('id')
  }
  if (nameLower.includes(q)) {
    score += 0.6
    matchedOn.push('name')
  }
  // Single pass over tags: partial match contributes once.
  let tagPartial = false
  for (const t of tagsLower) {
    if (t.includes(q)) {
      tagPartial = true
      break
    }
  }
  if (tagPartial) {
    score += 0.5
    matchedOn.push('tags')
  }

  return score > 0 ? { entry, score, matchedOn } : null
}

export function searchEntries(
  entries: IndexEntry[],
  query: string,
  limit: number = DEFAULT_LIMIT,
): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return []

  const lowered = getLowered(entries)
  const hits: SearchHit[] = []
  for (const item of lowered) {
    const hit = scoreEntry(item, q)
    if (hit) hits.push(hit)
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
