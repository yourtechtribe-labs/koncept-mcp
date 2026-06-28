import { describe, it, expect } from 'vitest'
import { ConceptSchema, KEBAB_ID_REGEX } from '../src/schema.js'

const VALID = {
  id: 'fix-b-pruab-internal-override',
  name: 'Fix B — PRUAB-internal Handler Override',
  type: 'behavioral-invariant',
  description: 'Some description',
  source_of_truth: { file: 'apps/web/src/lib/auth/admin.ts', symbol: 'isPruabInternalOrg' },
  participants: [
    { file: 'apps/web/src/lib/moderation/approve.ts', role: 'writer', purpose: 'Apply override' },
  ],
  invariants: [
    { id: 'ui-must-segregate', description: 'UI must segregate', severity: 'high' },
  ],
  related_concepts: ['sector-resolution'],
  tags: ['fira2026'],
  created: '2026-05-02',
  last_updated: '2026-05-03',
}

describe('ConceptSchema', () => {
  it('accepts a valid concept', () => {
    const result = ConceptSchema.safeParse(VALID)
    expect(result.success).toBe(true)
  })

  it('applies defaults: status=active, participants=[], invariants=[], tags=[]', () => {
    const minimal = {
      id: 'minimal',
      name: 'Minimal',
      type: 'data-flow',
      description: 'desc',
      source_of_truth: { file: 'src/x.ts' },
      created: '2026-01-01',
      last_updated: '2026-01-01',
    }
    const result = ConceptSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('active')
      expect(result.data.participants).toEqual([])
      expect(result.data.invariants).toEqual([])
      expect(result.data.tags).toEqual([])
      expect(result.data.related_concepts).toEqual([])
    }
  })

  it('rejects id with uppercase or invalid chars', () => {
    const bad = { ...VALID, id: 'Fix-B' }
    const result = ConceptSchema.safeParse(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      const idIssue = result.error.issues.find((i) => i.path[0] === 'id')
      expect(idIssue).toBeDefined()
    }
  })

  it('rejects type not in enum', () => {
    const bad = { ...VALID, type: 'invariant' }
    const result = ConceptSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects participants[].role not in enum', () => {
    const bad = {
      ...VALID,
      participants: [{ file: 'a.ts', role: 'developer', purpose: 'x' }],
    }
    const result = ConceptSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects invariants[].severity not in enum', () => {
    const bad = {
      ...VALID,
      invariants: [{ id: 'x', description: 'd', severity: 'critical' }],
    }
    const result = ConceptSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects related_concepts with non-kebab id', () => {
    const bad = { ...VALID, related_concepts: ['Bad_Id'] }
    const result = ConceptSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields (name)', () => {
    const incomplete = { ...VALID } as Record<string, unknown>
    delete incomplete.name
    const result = ConceptSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })

  it('defaults invariant.check to {kind: none} when omitted', () => {
    const result = ConceptSchema.safeParse(VALID)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.invariants[0].check).toEqual({ kind: 'none' })
    }
  })

  it('accepts invariant.check kind: grep with required fields', () => {
    const c = {
      ...VALID,
      invariants: [
        {
          id: 'xx',
          description: 'd',
          severity: 'high',
          check: { kind: 'grep', pattern: 'foo', in: ['src/x.ts'] },
        },
      ],
    }
    const result = ConceptSchema.safeParse(c)
    expect(result.success).toBe(true)
    if (result.success) {
      const check = result.data.invariants[0].check
      expect(check.kind).toBe('grep')
      if (check.kind === 'grep') {
        expect(check.should_match).toBe(true)
      }
    }
  })

  it('rejects invariant.check kind: grep without pattern', () => {
    const c = {
      ...VALID,
      invariants: [
        {
          id: 'xx',
          description: 'd',
          severity: 'high',
          check: { kind: 'grep', in: ['src/x.ts'] },
        },
      ],
    }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  it('accepts invariant.check kind: command', () => {
    const c = {
      ...VALID,
      invariants: [
        {
          id: 'xx',
          description: 'd',
          severity: 'high',
          check: { kind: 'command', cmd: 'pnpm test' },
        },
      ],
    }
    expect(ConceptSchema.safeParse(c).success).toBe(true)
  })

  // ─── #36: static enforcement kinds ─────────────────────────────────────────

  it('accepts invariant.check kind: implication with if/then', () => {
    const c = {
      ...VALID,
      invariants: [
        {
          id: 'xx',
          description: 'd',
          severity: 'high',
          check: { kind: 'implication', if: 'BankingCacheService', then: 'CacheInvalidationService' },
        },
      ],
    }
    const result = ConceptSchema.safeParse(c)
    expect(result.success).toBe(true)
    if (result.success) {
      const check = result.data.invariants[0].check
      expect(check.kind).toBe('implication')
      if (check.kind === 'implication') {
        expect(check.if).toBe('BankingCacheService')
        expect(check.then).toBe('CacheInvalidationService')
      }
    }
  })

  it('accepts kind: implication with an over.role selector', () => {
    const c = {
      ...VALID,
      invariants: [
        {
          id: 'xx',
          description: 'd',
          severity: 'high',
          check: { kind: 'implication', over: { role: 'writer' }, if: 'a', then: 'b' },
        },
      ],
    }
    const result = ConceptSchema.safeParse(c)
    expect(result.success).toBe(true)
    if (result.success) {
      const check = result.data.invariants[0].check
      if (check.kind === 'implication') {
        expect(check.over).toEqual({ role: 'writer' })
      }
    }
  })

  it('rejects kind: implication without then', () => {
    const c = {
      ...VALID,
      invariants: [
        { id: 'xx', description: 'd', severity: 'high', check: { kind: 'implication', if: 'a' } },
      ],
    }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  it('rejects an over selector with an unknown role', () => {
    const c = {
      ...VALID,
      invariants: [
        {
          id: 'xx',
          description: 'd',
          severity: 'high',
          check: { kind: 'symbol_present', over: { role: 'architect' }, pattern: 'x' },
        },
      ],
    }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  it('accepts kind: symbol_present and kind: forbidden with a pattern', () => {
    for (const kind of ['symbol_present', 'forbidden'] as const) {
      const c = {
        ...VALID,
        invariants: [
          { id: 'xx', description: 'd', severity: 'high', check: { kind, pattern: 'Foo' } },
        ],
      }
      const result = ConceptSchema.safeParse(c)
      expect(result.success, kind).toBe(true)
      if (result.success) {
        expect(result.data.invariants[0].check.kind).toBe(kind)
      }
    }
  })

  it('rejects kind: symbol_present without pattern', () => {
    const c = {
      ...VALID,
      invariants: [
        { id: 'xx', description: 'd', severity: 'high', check: { kind: 'symbol_present' } },
      ],
    }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  it('rejects an unknown check kind', () => {
    const c = {
      ...VALID,
      invariants: [
        { id: 'xx', description: 'd', severity: 'high', check: { kind: 'telepathy', pattern: 'x' } },
      ],
    }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  it('related_concepts accepts plain string ids and {id, type} objects in the same list', () => {
    const c = {
      ...VALID,
      related_concepts: [
        'sector-resolution',
        { id: 'old-thing', type: 'superseded-by' },
        { id: 'sibling' },
      ],
    }
    const result = ConceptSchema.safeParse(c)
    expect(result.success).toBe(true)
    if (result.success) {
      const links = result.data.related_concepts
      expect(typeof links[0]).toBe('string')
      expect(typeof links[1]).toBe('object')
      if (typeof links[1] !== 'string') expect(links[1].type).toBe('superseded-by')
      if (typeof links[2] !== 'string') expect(links[2].type).toBe('related')
    }
  })

  it('rejects related_concepts object with invalid type', () => {
    const c = {
      ...VALID,
      related_concepts: [{ id: 'x', type: 'nonsense' }],
    }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  // ─── K3: glossary_terms ──────────────────────────────────────────────────────

  it('defaults glossary_terms to [] when omitted (non-breaking for pre-K3 concepts)', () => {
    const result = ConceptSchema.safeParse(VALID)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.glossary_terms).toEqual([])
  })

  it('accepts glossary_terms as free strings (not restricted to kebab)', () => {
    const c = { ...VALID, glossary_terms: ['vencimiento', 'factura-wr', 'contraparte'] }
    const result = ConceptSchema.safeParse(c)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.glossary_terms).toEqual(['vencimiento', 'factura-wr', 'contraparte'])
  })

  it('rejects an empty string inside glossary_terms', () => {
    const c = { ...VALID, glossary_terms: ['ok', ''] }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  // ─── K4: naming block ────────────────────────────────────────────────────────

  it('naming is optional (absent → undefined, concept still valid)', () => {
    const result = ConceptSchema.safeParse(VALID)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.naming).toBeUndefined()
  })

  it('accepts a naming block with canonical + forbidden[]', () => {
    const c = {
      ...VALID,
      type: 'naming-convention',
      naming: { canonical: 'next_maturity', forbidden: ['maturity_date', 'expiration_date'] },
    }
    const result = ConceptSchema.safeParse(c)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.naming?.canonical).toBe('next_maturity')
      expect(result.data.naming?.forbidden).toEqual(['maturity_date', 'expiration_date'])
    }
  })

  it('rejects a naming block with an empty forbidden[] (must have ≥1 alias)', () => {
    const c = { ...VALID, naming: { canonical: 'x', forbidden: [] } }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })

  it('rejects a naming block missing canonical', () => {
    const c = { ...VALID, naming: { forbidden: ['x'] } }
    expect(ConceptSchema.safeParse(c).success).toBe(false)
  })
})

describe('KEBAB_ID_REGEX', () => {
  it('accepts valid kebab-case ids', () => {
    expect(KEBAB_ID_REGEX.test('fix-b')).toBe(true)
    expect(KEBAB_ID_REGEX.test('a-b-c-d-e')).toBe(true)
    expect(KEBAB_ID_REGEX.test('handler-role')).toBe(true)
    expect(KEBAB_ID_REGEX.test('p123-x')).toBe(true)
  })

  it('rejects invalid ids', () => {
    expect(KEBAB_ID_REGEX.test('Fix-B')).toBe(false) // uppercase
    expect(KEBAB_ID_REGEX.test('a')).toBe(false) // single char (regex requires 2+)
    expect(KEBAB_ID_REGEX.test('1abc')).toBe(false) // starts with digit
    expect(KEBAB_ID_REGEX.test('snake_case')).toBe(false) // underscore
    expect(KEBAB_ID_REGEX.test('')).toBe(false) // empty
  })
})
