import { describe, it, expect } from 'vitest'
import { suggestLinks } from '../src/suggest-links.js'
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

describe('suggestLinks', () => {
  it('suggests a pair when they share a participant file', () => {
    const a = concept({
      id: 'a',
      source_of_truth: { file: 'src/shared.ts' },
    })
    const b = concept({
      id: 'b',
      source_of_truth: { file: 'src/b.ts' },
      participants: [{ file: 'src/shared.ts', role: 'reader', purpose: 'reads' }],
    })
    const out = suggestLinks([a, b])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      a: 'a',
      b: 'b',
      shared_participants: ['src/shared.ts'],
    })
  })

  it('suggests a pair when they share enough tags', () => {
    const a = concept({ id: 'a', tags: ['security', 'auth'] })
    const b = concept({ id: 'b', tags: ['security', 'auth', 'jwt'] })
    const out = suggestLinks([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].shared_tags).toEqual(['auth', 'security'])
  })

  it('does not suggest when shared tags are below threshold', () => {
    const a = concept({ id: 'a', tags: ['security'] })
    const b = concept({ id: 'b', tags: ['security'] })
    const out = suggestLinks([a, b])
    expect(out).toEqual([])
  })

  it('respects custom minSharedTags', () => {
    const a = concept({ id: 'a', tags: ['security'] })
    const b = concept({ id: 'b', tags: ['security'] })
    const out = suggestLinks([a, b], { minSharedTags: 1 })
    expect(out).toHaveLength(1)
  })

  it('excludes pairs already in related_concepts (either direction)', () => {
    const a = concept({
      id: 'a',
      source_of_truth: { file: 'src/shared.ts' },
      related_concepts: ['b'],
    })
    const b = concept({
      id: 'b',
      participants: [{ file: 'src/shared.ts', role: 'reader', purpose: 'p' }],
    })
    expect(suggestLinks([a, b])).toEqual([])
    const aClean = { ...a, related_concepts: [] }
    const bLinked = { ...b, related_concepts: ['a'] }
    expect(suggestLinks([aClean, bLinked])).toEqual([])
  })

  it('orders pairs canonically (a.id < b.id) regardless of input order', () => {
    const a = concept({ id: 'zebra', tags: ['x', 'y'] })
    const b = concept({ id: 'alpha', tags: ['x', 'y'] })
    const out = suggestLinks([a, b])
    expect(out[0].a).toBe('alpha')
    expect(out[0].b).toBe('zebra')
  })

  it('sorts suggestions by score desc', () => {
    const a = concept({
      id: 'a',
      source_of_truth: { file: 'src/x.ts' },
      tags: ['t1', 't2'],
    })
    const b = concept({
      id: 'b',
      participants: [{ file: 'src/x.ts', role: 'reader', purpose: 'p' }],
      tags: ['t1', 't2'],
    })
    const c = concept({ id: 'c', tags: ['t1', 't2'] })
    const out = suggestLinks([a, b, c])
    expect(out[0]).toMatchObject({ a: 'a', b: 'b' })
    expect(out[0].score).toBeGreaterThan(out[1].score)
  })

  it('matches files case-insensitively (NTFS quirk)', () => {
    const a = concept({ id: 'a', source_of_truth: { file: 'src/Schema.ts' } })
    const b = concept({
      id: 'b',
      source_of_truth: { file: 'src/b.ts' },
      participants: [{ file: 'src/schema.ts', role: 'reader', purpose: 'p' }],
    })
    const out = suggestLinks([a, b])
    expect(out).toHaveLength(1)
  })
})
