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
