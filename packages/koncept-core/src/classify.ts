/**
 * Invariant classification & sign-off — the projection layer on top of the
 * raw affected graph. `klass` derives from `check.kind`; the summary + ack
 * annotation power `koncepto affected --require-ack`. Kept out of affected.ts
 * so that file stays a focused graph computation under the size budget.
 *
 * Type-only imports from affected.ts (AffectedConcept) erase at runtime, so
 * there is no import cycle: affected.ts → classify.ts is the only value edge.
 */

import type { AffectedConcept } from './affected.js'
import type { AutomatedCheck } from './schema.js'

/**
 * Derived from `check.kind`: `none` invariants need human/LLM judgment
 * (advisory); every other kind is machine-verified (automated) — grep/command via
 * `koncepto check`, and the static kinds (implication/symbol_present/forbidden, #36)
 * also via `koncepto verify`. A pure projection of existing data — no schema field.
 *
 * NOTE: the rule is `kind !== 'none'`, deliberately NOT an allowlist — a new
 * enforcement kind is automatically `automated` without touching this file.
 */
export type InvariantClass = 'automated' | 'advisory'

export function classifyCheck(check: AutomatedCheck): InvariantClass {
  return check.kind === 'none' ? 'advisory' : 'automated'
}

/** Ack key for an invariant: `"<concept-id>:<invariant-id>"`. */
export function ackKey(conceptId: string, invariantId: string): string {
  return `${conceptId}:${invariantId}`
}

export interface AffectedSummary {
  automated: number
  advisory: number
  advisory_high: number
  /** advisory_high not acked; always 0 unless acks were passed (ack-mode). */
  unacknowledged_high: number
}

/** Sets `acknowledged` on every advisory invariant (ack-mode only). */
export function annotateAcks(affected: AffectedConcept, acks: ReadonlySet<string>): void {
  for (const inv of affected.invariants) {
    if (inv.klass !== 'advisory') continue
    inv.acknowledged = acks.has(ackKey(inv.concept_id, inv.invariant_id))
  }
}

export function computeSummary(
  concepts: AffectedConcept[],
  ackMode: boolean,
): AffectedSummary {
  let automated = 0
  let advisory = 0
  let advisoryHigh = 0
  let unacknowledgedHigh = 0
  for (const c of concepts) {
    for (const inv of c.invariants) {
      if (inv.klass === 'automated') automated++
      else advisory++
      if (inv.klass === 'advisory' && inv.severity === 'high') {
        advisoryHigh++
        if (ackMode && inv.acknowledged === false) unacknowledgedHigh++
      }
    }
  }
  return {
    automated,
    advisory,
    advisory_high: advisoryHigh,
    unacknowledged_high: ackMode ? unacknowledgedHigh : 0,
  }
}
