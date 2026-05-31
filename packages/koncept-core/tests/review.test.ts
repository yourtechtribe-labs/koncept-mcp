import { describe, it, expect } from 'vitest'
import { parseVerdict, reviewAffected } from '../src/review.js'
import type { ReviewOptions } from '../src/review.js'
import type { Concept } from '../src/schema.js'

function concept(overrides: Partial<Concept> & { id: string }): Concept {
  return {
    id: overrides.id,
    name: overrides.name ?? `Concept ${overrides.id}`,
    type: overrides.type ?? 'data-flow',
    status: overrides.status ?? 'active',
    description: overrides.description ?? 'test concept',
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

function baseOpts(over: Partial<ReviewOptions> = {}): ReviewOptions {
  return {
    rootDir: '/repo',
    changedFiles: ['src/a.ts'],
    diff: () => '@@ -1 +1 @@\n+changed\n',
    minSeverity: 'medium',
    llm: async () => '{"verdict":"holds","rationale":"ok"}',
    ...over,
  }
}

describe('parseVerdict', () => {
  it('parses a clean JSON object', () => {
    const r = parseVerdict('{"verdict":"holds","rationale":"no governed metric recomputed"}')
    expect(r).toEqual({ verdict: 'holds', rationale: 'no governed metric recomputed' })
  })

  it('parses each valid verdict value', () => {
    expect(parseVerdict('{"verdict":"violated","rationale":"x"}').verdict).toBe('violated')
    expect(parseVerdict('{"verdict":"uncertain","rationale":"x"}').verdict).toBe('uncertain')
  })

  it('extracts JSON wrapped in markdown fences / prose', () => {
    const raw = 'Here is my verdict:\n```json\n{"verdict":"violated","rationale":"adds a Seq Scan"}\n```'
    expect(parseVerdict(raw)).toEqual({ verdict: 'violated', rationale: 'adds a Seq Scan' })
  })

  it('supplies a non-empty rationale when the model omits it', () => {
    const r = parseVerdict('{"verdict":"holds"}')
    expect(r.verdict).toBe('holds')
    expect(r.rationale.length).toBeGreaterThan(0)
  })

  it('falls back to scanning prose when there is no JSON', () => {
    const r = parseVerdict('The invariant holds because the new reader uses the index.')
    expect(r.verdict).toBe('holds')
    expect(r.rationale.length).toBeGreaterThan(0)
  })

  it('coerces an unparseable response to uncertain', () => {
    const r = parseVerdict('¯\\_(ツ)_/¯')
    expect(r).toEqual({ verdict: 'uncertain', rationale: 'unparseable model output' })
  })

  it('coerces an unknown verdict value to uncertain', () => {
    const r = parseVerdict('{"verdict":"maybe","rationale":"x"}')
    expect(r.verdict).toBe('uncertain')
  })
})

describe('reviewAffected', () => {
  const advisoryHigh = concept({
    id: 'a',
    source_of_truth: { file: 'src/a.ts' },
    invariants: [{ id: 'adv', description: 'must hold', severity: 'high', check: { kind: 'none' } }],
  })

  it('reviews a touched advisory invariant and returns its verdict + rationale', async () => {
    const r = await reviewAffected([advisoryHigh], baseOpts())
    expect(r.reviews).toHaveLength(1)
    expect(r.reviews[0]).toMatchObject({
      conceptId: 'a',
      invariantId: 'adv',
      severity: 'high',
      verdict: 'holds',
    })
    expect(r.reviews[0].rationale.length).toBeGreaterThan(0)
    expect(r.holds).toBe(1)
  })

  it('skips automated invariants (machine-checked elsewhere)', async () => {
    const auto = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      invariants: [
        { id: 'g', description: 'd', severity: 'high', check: { kind: 'command', cmd: 'true' } },
      ],
    })
    const r = await reviewAffected([auto], baseOpts())
    expect(r.reviews).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('skips advisory invariants below --severity', async () => {
    const low = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      invariants: [{ id: 'lo', description: 'd', severity: 'low', check: { kind: 'none' } }],
    })
    const r = await reviewAffected([low], baseOpts({ minSeverity: 'medium' }))
    expect(r.reviews).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('does not review invariants of concepts not touched by the diff', async () => {
    const untouched = concept({
      id: 'b',
      source_of_truth: { file: 'src/b.ts' },
      invariants: [{ id: 'x', description: 'd', severity: 'high', check: { kind: 'none' } }],
    })
    const r = await reviewAffected([advisoryHigh, untouched], baseOpts())
    expect(r.reviews.map((x) => x.conceptId)).toEqual(['a'])
  })

  it('makes one llm call per invariant with all matched files in context', async () => {
    const twoFiles = concept({
      id: 'a',
      source_of_truth: { file: 'src/a.ts' },
      participants: [{ file: 'src/a2.ts', role: 'reader', purpose: 'also reads' }],
      invariants: [{ id: 'adv', description: 'd', severity: 'high', check: { kind: 'none' } }],
    })
    const prompts: string[] = []
    const r = await reviewAffected(
      [twoFiles],
      baseOpts({
        changedFiles: ['src/a.ts', 'src/a2.ts'],
        llm: async (p) => {
          prompts.push(p)
          return '{"verdict":"violated","rationale":"r"}'
        },
      }),
    )
    expect(prompts).toHaveLength(1)
    expect(r.reviews[0].files.sort()).toEqual(['src/a.ts', 'src/a2.ts'])
    expect(r.violated).toBe(1)
  })

  it('coerces an unparseable llm reply to uncertain (does not throw)', async () => {
    const r = await reviewAffected([advisoryHigh], baseOpts({ llm: async () => 'no idea' }))
    expect(r.reviews[0].verdict).toBe('uncertain')
    expect(r.uncertain).toBe(1)
  })

  it('propagates an llm error tagged with concept:invariant', async () => {
    await expect(
      reviewAffected(
        [advisoryHigh],
        baseOpts({
          llm: async () => {
            throw new Error('503 overloaded')
          },
        }),
      ),
    ).rejects.toThrow(/a:adv.*503 overloaded/)
  })
})
