/**
 * Impact analysis — given a list of changed files, report which concepts and
 * invariants are touched. Pure function over already-loaded Concept[]; the
 * caller (CLI / MCP tool) is responsible for fetching concepts and the diff.
 *
 * Path comparison is forward-slash + lowercase (NTFS is case-insensitive; git
 * on `core.ignorecase=true` may surface either case). Matching is exact after
 * normalization — no glob, no prefix.
 */

import {
  annotateAcks,
  classifyCheck,
  computeSummary,
  type AffectedSummary,
  type InvariantClass,
} from './classify.js'
import { normalizeForward } from './paths.js'
import type {
  AutomatedCheck,
  Concept,
  ConceptType,
  Role,
  Severity,
} from './schema.js'

export type MatchedRole = Role | 'source_of_truth'

export interface AffectedInvariant {
  concept_id: string
  concept_name: string
  invariant_id: string
  description: string
  severity: Severity
  check: AutomatedCheck
  klass: InvariantClass
  /** Only populated in ack-mode (acks passed to computeAffected); advisory only. */
  acknowledged?: boolean
}

export interface AffectedConcept {
  id: string
  name: string
  type: ConceptType
  matched_files: Array<{ file: string; role: MatchedRole }>
  other_participants: string[]
  invariants: AffectedInvariant[]
  max_severity: Severity | null
}

export interface AffectedReport {
  changed_files: string[]
  concepts: AffectedConcept[]
  unmatched_files: string[]
  summary: AffectedSummary
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 }

function normalizeKey(p: string): string {
  return normalizeForward(p).toLowerCase()
}

/**
 * Extracts the bare ids from `related_concepts`, normalizing the union
 * (string | {id, type}). Single point of access so future schema evolution
 * (e.g. removing the bare-string form) only touches this function.
 */
export function resolveRelatedIds(concept: Concept): string[] {
  return concept.related_concepts.map((r) => (typeof r === 'string' ? r : r.id))
}

/**
 * Pure computation: which concepts are touched by `changedFiles`?
 *
 * `acks` (optional) turns on ack-mode: when provided (even empty), each
 * advisory invariant gets an `acknowledged` flag and the summary reports
 * `unacknowledged_high`. Omitted → ack-mode off (MCP enumeration path).
 */
export function computeAffected(
  concepts: Concept[],
  changedFiles: string[],
  acks?: ReadonlySet<string>,
): AffectedReport {
  const normalizedChanged = changedFiles.map(normalizeKey)
  const fileToConcepts = buildFileIndex(concepts)
  const { matched, matchedKeys } = matchChangedFiles(
    fileToConcepts,
    changedFiles,
    normalizedChanged,
  )
  for (const affected of matched.values()) {
    const concept = concepts.find((c) => c.id === affected.id)!
    affected.other_participants = computeOtherParticipants(concept, affected)
    if (acks !== undefined) annotateAcks(affected, acks)
  }
  const unmatched = changedFiles.filter((_, i) => !matchedKeys.has(normalizedChanged[i]))
  const concepts_ = [...matched.values()].sort(byMaxSeverityThenId)
  return {
    changed_files: changedFiles.map(normalizeForward),
    concepts: concepts_,
    unmatched_files: unmatched.map(normalizeForward),
    summary: computeSummary(concepts_, acks !== undefined),
  }
}


function buildFileIndex(
  concepts: Concept[],
): Map<string, Array<{ concept: Concept; role: MatchedRole }>> {
  const map = new Map<string, Array<{ concept: Concept; role: MatchedRole }>>()
  for (const concept of concepts) {
    pushFileEntry(map, normalizeKey(concept.source_of_truth.file), concept, 'source_of_truth')
    for (const p of concept.participants) {
      pushFileEntry(map, normalizeKey(p.file), concept, p.role)
    }
  }
  return map
}

function matchChangedFiles(
  fileToConcepts: Map<string, Array<{ concept: Concept; role: MatchedRole }>>,
  changedFiles: string[],
  normalizedChanged: string[],
): { matched: Map<string, AffectedConcept>; matchedKeys: Set<string> } {
  const matched = new Map<string, AffectedConcept>()
  const matchedKeys = new Set<string>()
  for (let i = 0; i < normalizedChanged.length; i++) {
    const key = normalizedChanged[i]
    const hits = fileToConcepts.get(key)
    if (!hits) continue
    matchedKeys.add(key)
    for (const { concept, role } of hits) {
      const existing = matched.get(concept.id) ?? makeAffected(concept)
      const dup = existing.matched_files.some(
        (m) => normalizeKey(m.file) === key && m.role === role,
      )
      if (!dup) existing.matched_files.push({ file: normalizeForward(changedFiles[i]), role })
      matched.set(concept.id, existing)
    }
  }
  return { matched, matchedKeys }
}

function computeOtherParticipants(concept: Concept, affected: AffectedConcept): string[] {
  const all = new Set(concept.participants.map((p) => normalizeForward(p.file)))
  all.add(normalizeForward(concept.source_of_truth.file))
  const matchedSet = new Set(affected.matched_files.map((m) => normalizeKey(m.file)))
  return [...all].filter((f) => !matchedSet.has(f.toLowerCase())).sort()
}

function pushFileEntry(
  map: Map<string, Array<{ concept: Concept; role: MatchedRole }>>,
  key: string,
  concept: Concept,
  role: MatchedRole,
): void {
  const list = map.get(key) ?? []
  list.push({ concept, role })
  map.set(key, list)
}

function makeAffected(concept: Concept): AffectedConcept {
  const invariants: AffectedInvariant[] = concept.invariants.map((inv) => ({
    concept_id: concept.id,
    concept_name: concept.name,
    invariant_id: inv.id,
    description: inv.description,
    severity: inv.severity,
    check: inv.check,
    klass: classifyCheck(inv.check),
  }))
  invariants.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
  const maxSev = invariants.length > 0 ? invariants[0].severity : null
  return {
    id: concept.id,
    name: concept.name,
    type: concept.type,
    matched_files: [],
    other_participants: [],
    invariants,
    max_severity: maxSev,
  }
}

function byMaxSeverityThenId(a: AffectedConcept, b: AffectedConcept): number {
  const av = a.max_severity ? SEVERITY_RANK[a.max_severity] : 0
  const bv = b.max_severity ? SEVERITY_RANK[b.max_severity] : 0
  if (av !== bv) return bv - av
  return a.id.localeCompare(b.id)
}
