/**
 * Auto-link inference — surface candidate `related_concepts` based on
 * objective signals: shared participants (including source_of_truth) and
 * shared tags. Suggestions only; never mutates concepts.
 *
 * Already-linked pairs (a→b OR b→a in `related_concepts`) are excluded so
 * the user is never reminded of links they have already curated.
 */

import { normalizeForward } from './paths.js'
import { resolveRelatedIds } from './affected.js'
import type { Concept } from './schema.js'

export interface SuggestLinksOptions {
  /** Minimum shared tags to count tag-only suggestion (default 2). */
  minSharedTags?: number
}

export interface LinkSuggestion {
  /** Lexicographically ordered (a.id < b.id) for canonical pairs. */
  a: string
  b: string
  shared_participants: string[]
  shared_tags: string[]
  /** Higher = stronger candidate. Participants weight 2, tags weight 1. */
  score: number
}

const DEFAULT_MIN_SHARED_TAGS = 2

export function suggestLinks(
  concepts: Concept[],
  opts: SuggestLinksOptions = {},
): LinkSuggestion[] {
  const minTags = opts.minSharedTags ?? DEFAULT_MIN_SHARED_TAGS
  const fileSets = concepts.map(filesOf)
  const tagSets = concepts.map((c) => new Set(c.tags))
  const linkedPairs = buildLinkedPairs(concepts)

  const suggestions: LinkSuggestion[] = []
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const a = concepts[i]
      const b = concepts[j]
      if (linkedPairs.has(pairKey(a.id, b.id))) continue
      const sharedFiles = intersectSorted(fileSets[i], fileSets[j])
      const sharedTags = intersectSorted(tagSets[i], tagSets[j])
      if (sharedFiles.length === 0 && sharedTags.length < minTags) continue
      suggestions.push({
        a: a.id < b.id ? a.id : b.id,
        b: a.id < b.id ? b.id : a.id,
        shared_participants: sharedFiles,
        shared_tags: sharedTags,
        score: sharedFiles.length * 2 + sharedTags.length,
      })
    }
  }
  return suggestions.sort((x, y) => {
    if (x.score !== y.score) return y.score - x.score
    if (x.a !== y.a) return x.a.localeCompare(y.a)
    return x.b.localeCompare(y.b)
  })
}

function filesOf(c: Concept): Set<string> {
  const set = new Set<string>()
  set.add(normalizeForward(c.source_of_truth.file).toLowerCase())
  for (const p of c.participants) {
    set.add(normalizeForward(p.file).toLowerCase())
  }
  return set
}

function buildLinkedPairs(concepts: Concept[]): Set<string> {
  const set = new Set<string>()
  for (const c of concepts) {
    for (const related of resolveRelatedIds(c)) {
      set.add(pairKey(c.id, related))
    }
  }
  return set
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function intersectSorted(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = []
  for (const v of a) if (b.has(v)) out.push(v)
  return out.sort()
}
