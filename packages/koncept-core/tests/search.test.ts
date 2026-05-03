import { describe, it, expect } from 'vitest'
import { searchEntries } from '../src/search.js'
import type { IndexEntry } from '../src/schema.js'

const ENTRIES: IndexEntry[] = [
  {
    id: 'fix-b-pruab-internal-override',
    name: 'Fix B — PRUAB-internal Handler Override',
    type: 'behavioral-invariant',
    status: 'active',
    participants_paths: ['apps/web/src/lib/auth/admin.ts'],
    tags: ['fira2026', 'routing', 'fix-b'],
    file: '.koncept/concepts/fix-b.yaml',
  },
  {
    id: 'sector-resolution',
    name: 'Sector resolution',
    type: 'data-flow',
    status: 'active',
    participants_paths: ['apps/scraper/src/sector-mapping.ts'],
    tags: ['fira2026', 'sector'],
    file: '.koncept/concepts/sector.yaml',
  },
  {
    id: 'handler-role',
    name: 'Handler role split',
    type: 'architectural-decision',
    status: 'active',
    participants_paths: ['apps/web/src/lib/auth/session.ts'],
    tags: ['fira2026', 'auth', 'rbac'],
    file: '.koncept/concepts/handler-role.yaml',
  },
]

describe('searchEntries', () => {
  it('returns exact id match with score 1.0', () => {
    const hits = searchEntries(ENTRIES, 'sector-resolution')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.score).toBe(1.0)
    expect(hits[0]?.entry.id).toBe('sector-resolution')
  })

  it('returns exact tag match with score 0.9', () => {
    const hits = searchEntries(ENTRIES, 'fix-b')
    // 'fix-b' is also a substring of 'fix-b-pruab-internal-override' id
    expect(hits[0]?.entry.id).toBe('fix-b-pruab-internal-override')
    expect(hits[0]?.matchedOn).toContain('tags')
  })

  it('returns fuzzy substring matches in id and name', () => {
    const hits = searchEntries(ENTRIES, 'handler')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.entry.id).toBe('handler-role')
    expect(hits[0]?.matchedOn).toContain('id')
  })

  it('matches by tag substring (auth)', () => {
    const hits = searchEntries(ENTRIES, 'auth')
    expect(hits.find((h) => h.entry.id === 'handler-role')).toBeDefined()
  })

  it('returns empty array for no match', () => {
    const hits = searchEntries(ENTRIES, 'nonexistent-keyword')
    expect(hits).toEqual([])
  })

  it('returns empty array for empty query', () => {
    const hits = searchEntries(ENTRIES, '   ')
    expect(hits).toEqual([])
  })

  it('honors limit argument', () => {
    const hits = searchEntries(ENTRIES, 'fira2026', 2)
    expect(hits).toHaveLength(2)
  })

  it('ranks higher score first', () => {
    const hits = searchEntries(ENTRIES, 'sector')
    expect(hits[0]?.entry.id).toBe('sector-resolution') // tag exact + id substring
  })

  it('is case-insensitive', () => {
    const hits = searchEntries(ENTRIES, 'PRUAB')
    expect(hits.find((h) => h.entry.id === 'fix-b-pruab-internal-override')).toBeDefined()
  })
})
