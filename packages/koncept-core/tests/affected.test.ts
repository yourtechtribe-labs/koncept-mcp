import { describe, it, expect } from 'vitest'
import { computeAffected } from '../src/affected.js'
import type { Concept } from '../src/schema.js'

function concept(overrides: Partial<Concept> & { id: string }): Concept {
  return {
    id: overrides.id,
    name: overrides.name ?? `Concept ${overrides.id}`,
    type: overrides.type ?? 'data-flow',
    status: overrides.status ?? 'active',
    description: overrides.description ?? 'test',
    source_of_truth: overrides.source_of_truth ?? { file: `src/${overrides.id}.ts` },
    participants: overrides.participants ?? [],
    invariants: overrides.invariants ?? [],
    risks_if_broken: overrides.risks_if_broken ?? [],
    related_concepts: overrides.related_concepts ?? [],
    tags: overrides.tags ?? [],
    created: overrides.created ?? '2026-01-01',
    last_updated: overrides.last_updated ?? '2026-01-01',
    references: overrides.references ?? [],
  }
}

describe('computeAffected', () => {
  it('matches a change in source_of_truth.file', () => {
    const c = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      invariants: [
        { id: 'inv1', description: 'must hold', severity: 'high', check: { kind: 'none' } },
      ],
    })
    const r = computeAffected([c], ['src/a.ts'])
    expect(r.concepts).toHaveLength(1)
    expect(r.concepts[0].matched_files).toEqual([{ file: 'src/a.ts', role: 'source_of_truth' }])
    expect(r.concepts[0].invariants).toHaveLength(1)
    expect(r.concepts[0].max_severity).toBe('high')
    expect(r.unmatched_files).toEqual([])
  })

  it('matches a change in participants[].file with the participant role', () => {
    const c = concept({
      id: 'b',
      source_of_truth: { file: 'src/b.ts' },
      participants: [{ file: 'src/b-helper.ts', role: 'reader', purpose: 'reads' }],
    })
    const r = computeAffected([c], ['src/b-helper.ts'])
    expect(r.concepts[0].matched_files).toEqual([{ file: 'src/b-helper.ts', role: 'reader' }])
  })

  it('puts files with no concept under unmatched_files', () => {
    const c = concept({ id: 'a', source_of_truth: { file: 'src/a.ts' } })
    const r = computeAffected([c], ['src/a.ts', 'src/random.ts'])
    expect(r.unmatched_files).toEqual(['src/random.ts'])
    expect(r.concepts).toHaveLength(1)
  })

  it('reports every concept that shares a file', () => {
    const c1 = concept({ id: 'a', source_of_truth: { file: 'src/shared.ts' } })
    const c2 = concept({
      id: 'b',
      source_of_truth: { file: 'src/b.ts' },
      participants: [{ file: 'src/shared.ts', role: 'writer', purpose: 'writes' }],
    })
    const r = computeAffected([c1, c2], ['src/shared.ts'])
    expect(r.concepts.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('normalizes backslash paths from input', () => {
    const c = concept({ id: 'a', source_of_truth: { file: 'src/a.ts' } })
    const r = computeAffected([c], ['src\\a.ts'])
    expect(r.concepts).toHaveLength(1)
    expect(r.concepts[0].matched_files[0].file).toBe('src/a.ts')
  })

  it('matches case-insensitively (NTFS quirk)', () => {
    const c = concept({ id: 'a', source_of_truth: { file: 'src/Schema.ts' } })
    const r = computeAffected([c], ['src/schema.ts'])
    expect(r.concepts).toHaveLength(1)
  })

  it('orders concepts by max severity desc, then id asc', () => {
    const low = concept({
      id: 'low',
      source_of_truth: { file: 'src/x.ts' },
      invariants: [{ id: 'i', description: 'd', severity: 'low', check: { kind: 'none' } }],
    })
    const high = concept({
      id: 'high',
      source_of_truth: { file: 'src/x.ts' },
      invariants: [{ id: 'i', description: 'd', severity: 'high', check: { kind: 'none' } }],
    })
    const med = concept({
      id: 'med',
      source_of_truth: { file: 'src/x.ts' },
      invariants: [{ id: 'i', description: 'd', severity: 'medium', check: { kind: 'none' } }],
    })
    const r = computeAffected([low, high, med], ['src/x.ts'])
    expect(r.concepts.map((c) => c.id)).toEqual(['high', 'med', 'low'])
  })

  it('lists other_participants minus the matched files', () => {
    const c = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      participants: [
        { file: 'src/a-helper.ts', role: 'reader', purpose: 'reads' },
        { file: 'tests/a.test.ts', role: 'tester', purpose: 'tests' },
      ],
    })
    const r = computeAffected([c], ['src/a.ts'])
    expect(r.concepts[0].other_participants.sort()).toEqual([
      'src/a-helper.ts',
      'tests/a.test.ts',
    ])
  })

  it('does not duplicate matched_files when the same file is passed twice', () => {
    const c = concept({ id: 'a', source_of_truth: { file: 'src/a.ts' } })
    const r = computeAffected([c], ['src/a.ts', 'src/a.ts'])
    expect(r.concepts[0].matched_files).toHaveLength(1)
  })

  it('returns empty concepts when nothing matches', () => {
    const c = concept({ id: 'a', source_of_truth: { file: 'src/a.ts' } })
    const r = computeAffected([c], ['unrelated/file.md'])
    expect(r.concepts).toEqual([])
    expect(r.unmatched_files).toEqual(['unrelated/file.md'])
  })
})

describe('computeAffected — invariant classification (klass)', () => {
  it('classifies check.kind none as advisory', () => {
    const c = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      invariants: [{ id: 'i', description: 'd', severity: 'high', check: { kind: 'none' } }],
    })
    const r = computeAffected([c], ['src/a.ts'])
    expect(r.concepts[0].invariants[0].klass).toBe('advisory')
  })

  it('classifies check.kind grep as automated', () => {
    const c = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      invariants: [
        {
          id: 'i',
          description: 'd',
          severity: 'high',
          check: { kind: 'grep', pattern: 'x', in: ['src/a.ts'], should_match: true },
        },
      ],
    })
    const r = computeAffected([c], ['src/a.ts'])
    expect(r.concepts[0].invariants[0].klass).toBe('automated')
  })

  it('classifies check.kind command as automated', () => {
    const c = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      invariants: [
        { id: 'i', description: 'd', severity: 'high', check: { kind: 'command', cmd: 'true' } },
      ],
    })
    const r = computeAffected([c], ['src/a.ts'])
    expect(r.concepts[0].invariants[0].klass).toBe('automated')
  })
})

describe('computeAffected — summary + acknowledgment', () => {
  const mixed = concept({
    id: 'a',
    source_of_truth: { file: 'src/a.ts' },
    invariants: [
      { id: 'advis-high', description: 'd', severity: 'high', check: { kind: 'none' } },
      { id: 'advis-low', description: 'd', severity: 'low', check: { kind: 'none' } },
      {
        id: 'auto',
        description: 'd',
        severity: 'high',
        check: { kind: 'grep', pattern: 'x', in: ['src/a.ts'], should_match: true },
      },
    ],
  })

  it('counts automated, advisory and advisory_high across concepts', () => {
    const r = computeAffected([mixed], ['src/a.ts'])
    expect(r.summary).toEqual({
      automated: 1,
      advisory: 2,
      advisory_high: 1,
      unacknowledged_high: 0,
    })
  })

  it('ack-mode OFF (no acks): unacknowledged_high is 0 and acknowledged is absent', () => {
    const r = computeAffected([mixed], ['src/a.ts'])
    expect(r.summary.unacknowledged_high).toBe(0)
    for (const inv of r.concepts[0].invariants) {
      expect(inv.acknowledged).toBeUndefined()
    }
  })

  it('ack-mode ON, unacked advisory_high → unacknowledged_high counted', () => {
    const r = computeAffected([mixed], ['src/a.ts'], new Set())
    const high = r.concepts[0].invariants.find((i) => i.invariant_id === 'advis-high')!
    expect(high.acknowledged).toBe(false)
    expect(r.summary.unacknowledged_high).toBe(1)
  })

  it('ack-mode ON, advisory_high acked → unacknowledged_high is 0', () => {
    const r = computeAffected([mixed], ['src/a.ts'], new Set(['a:advis-high']))
    const high = r.concepts[0].invariants.find((i) => i.invariant_id === 'advis-high')!
    expect(high.acknowledged).toBe(true)
    expect(r.summary.unacknowledged_high).toBe(0)
  })

  it('automated highs never require an ack (excluded from unacknowledged_high)', () => {
    const autoOnly = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      invariants: [
        {
          id: 'auto',
          description: 'd',
          severity: 'high',
          check: { kind: 'command', cmd: 'true' },
        },
      ],
    })
    const r = computeAffected([autoOnly], ['src/a.ts'], new Set())
    expect(r.summary.advisory_high).toBe(0)
    expect(r.summary.unacknowledged_high).toBe(0)
  })

  // Canonical motivating incident: one changed file participates in TWO
  // concepts; the second concept's advisory_high invariant must be acked.
  it('canonical incident: one file in two concepts, second advisory_high gates', () => {
    const indexBacked = concept({
      id: 'accounting-aggregate-index-backed',
      source_of_truth: { file: 'backend/unified_calculator.py' },
      invariants: [
        { id: 'new-readers-rely-on-index', description: 'd', severity: 'high', check: { kind: 'none' } },
      ],
    })
    const metricRegistry = concept({
      id: 'metric-registry-single-source-of-truth',
      source_of_truth: { file: 'backend/registry.py' },
      participants: [
        { file: 'backend/unified_calculator.py', role: 'reader', purpose: 'reads metrics' },
      ],
      invariants: [
        { id: 'no-duplicate-metric-calculations', description: 'd', severity: 'high', check: { kind: 'none' } },
      ],
    })
    const changed = ['backend/unified_calculator.py']

    const unacked = computeAffected([indexBacked, metricRegistry], changed, new Set())
    expect(unacked.concepts.map((c) => c.id).sort()).toEqual([
      'accounting-aggregate-index-backed',
      'metric-registry-single-source-of-truth',
    ])
    expect(unacked.summary.advisory_high).toBe(2)
    expect(unacked.summary.unacknowledged_high).toBe(2)

    const acked = computeAffected([indexBacked, metricRegistry], changed, new Set([
      'accounting-aggregate-index-backed:new-readers-rely-on-index',
      'metric-registry-single-source-of-truth:no-duplicate-metric-calculations',
    ]))
    expect(acked.summary.unacknowledged_high).toBe(0)
  })
})
