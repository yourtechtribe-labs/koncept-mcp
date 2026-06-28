import { describe, it, expect, vi } from 'vitest'
import {
  collectNamingCandidates,
  judgeCandidates,
  parseNamingVerdict,
  parseAddedLines,
  buildNamingPrompt,
  type ScannedFile,
} from '../src/lint-naming.js'
import type { Concept } from '../src/schema.js'

// A naming-convention concept governing "vencimiento" with two forbidden aliases.
const VENCIMIENTO: Concept = {
  id: 'naming-vencimiento',
  name: 'Vencimiento naming',
  type: 'naming-convention',
  status: 'active',
  description: 'next_maturity is the canonical name for a revolving maturity.',
  source_of_truth: { file: 'specs/domain/financing-data-dictionary.md' },
  participants: [],
  invariants: [],
  risks_if_broken: [],
  related_concepts: [],
  tags: [],
  glossary_terms: ['vencimiento', 'contraparte'],
  naming: { canonical: 'next_maturity', forbidden: ['maturity_date', 'expiration_date'] },
  created: '2026-06-28',
  last_updated: '2026-06-28',
}

const NO_NAMING: Concept = { ...VENCIMIENTO, id: 'plain', naming: undefined, glossary_terms: [] }

function file(name: string, lines: Array<[number, string]>): ScannedFile {
  return { file: name, lines: lines.map(([n, text]) => ({ n, text })) }
}

describe('collectNamingCandidates', () => {
  it('flags a line containing a forbidden alias', () => {
    const files = [file('a.py', [[10, '    maturity_date = invoice.due_date']])]
    const { candidates, rulesApplied } = collectNamingCandidates([VENCIMIENTO], files)
    expect(rulesApplied).toBe(1)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]
    expect(c.conceptId).toBe('naming-vencimiento')
    expect(c.alias).toBe('maturity_date')
    expect(c.canonical).toBe('next_maturity')
    expect(c.term).toBe('vencimiento') // first glossary term
    expect(c.file).toBe('a.py')
    expect(c.line).toBe(10)
    expect(c.text).toContain('maturity_date')
    expect(c.rubric).toContain('next_maturity')
  })

  it('ignores concepts without a naming block (rulesApplied = 0, no candidates)', () => {
    const files = [file('a.py', [[1, 'maturity_date = 1']])]
    const { candidates, rulesApplied } = collectNamingCandidates([NO_NAMING], files)
    expect(rulesApplied).toBe(0)
    expect(candidates).toEqual([])
  })

  it('produces no candidate when no forbidden alias appears', () => {
    const files = [file('a.py', [[1, 'next_maturity = invoice.due_date']])]
    const { candidates } = collectNamingCandidates([VENCIMIENTO], files)
    expect(candidates).toEqual([])
  })

  it('matches every forbidden alias across multiple files', () => {
    const files = [
      file('a.py', [[5, 'x = maturity_date']]),
      file('b.py', [[7, 'y = expiration_date'], [8, 'z = ok']]),
    ]
    const { candidates } = collectNamingCandidates([VENCIMIENTO], files)
    expect(candidates.map((c) => `${c.file}:${c.line}:${c.alias}`).sort()).toEqual([
      'a.py:5:maturity_date',
      'b.py:7:expiration_date',
    ])
  })

  it('term is null when the concept declares no glossary_terms', () => {
    const noTerm: Concept = { ...VENCIMIENTO, glossary_terms: [] }
    const files = [file('a.py', [[1, 'maturity_date']])]
    const { candidates } = collectNamingCandidates([noTerm], files)
    expect(candidates[0].term).toBeNull()
  })

  it('skips an invalid-regex alias without throwing', () => {
    const bad: Concept = { ...VENCIMIENTO, naming: { canonical: 'x', forbidden: ['([unterminated'] } }
    const files = [file('a.py', [[1, '([unterminated']])]
    expect(() => collectNamingCandidates([bad], files)).not.toThrow()
    expect(collectNamingCandidates([bad], files).candidates).toEqual([])
  })
})

describe('parseNamingVerdict', () => {
  it('parses a clean JSON object', () => {
    expect(parseNamingVerdict('{"violation": true, "reason": "real symbol"}')).toEqual({
      violation: true,
      reason: 'real symbol',
    })
  })

  it('extracts JSON embedded in prose', () => {
    const raw = 'Here is my call:\n{"violation": false, "reason": "it is a comment"}\nThanks'
    expect(parseNamingVerdict(raw)).toEqual({ violation: false, reason: 'it is a comment' })
  })

  it('defaults to NON-violation on unparseable output (advisory: never fabricate)', () => {
    expect(parseNamingVerdict('I think maybe?')).toEqual({
      violation: false,
      reason: 'unparseable model output',
    })
  })

  it('defaults to NON-violation when violation key is missing/non-boolean', () => {
    expect(parseNamingVerdict('{"reason": "no verdict"}').violation).toBe(false)
    expect(parseNamingVerdict('{"violation": "yes"}').violation).toBe(false)
  })

  it('supplies a placeholder reason when reason is empty', () => {
    expect(parseNamingVerdict('{"violation": true}').reason).toBe('(no reason provided)')
  })
})

describe('judgeCandidates', () => {
  it('makes zero LLM calls when there are no candidates (cost 0)', async () => {
    const llm = vi.fn()
    const findings = await judgeCandidates([], llm)
    expect(findings).toEqual([])
    expect(llm).not.toHaveBeenCalled()
  })

  it('attaches the verdict to each candidate', async () => {
    const files = [file('a.py', [[10, 'maturity_date = 1']])]
    const { candidates } = collectNamingCandidates([VENCIMIENTO], files)
    const llm = vi.fn().mockResolvedValue('{"violation": true, "reason": "domain symbol"}')
    const findings = await judgeCandidates(candidates, llm)
    expect(findings).toHaveLength(1)
    expect(findings[0].violation).toBe(true)
    expect(findings[0].reason).toBe('domain symbol')
    expect(findings[0].line).toBe(10) // grounding preserved from the candidate
    expect(llm).toHaveBeenCalledOnce()
  })

  it('propagates an LLM error tagged with file:line(alias)', async () => {
    const files = [file('a.py', [[3, 'maturity_date']])]
    const { candidates } = collectNamingCandidates([VENCIMIENTO], files)
    const llm = vi.fn().mockRejectedValue(new Error('429 rate limited'))
    await expect(judgeCandidates(candidates, llm)).rejects.toThrow(/a\.py:3 \(maturity_date\).*429/)
  })

  it('builds a prompt that names the canonical and the prohibited alias', () => {
    const files = [file('a.py', [[1, 'maturity_date']])]
    const { candidates } = collectNamingCandidates([VENCIMIENTO], files)
    const prompt = buildNamingPrompt(candidates[0])
    expect(prompt).toContain('next_maturity')
    expect(prompt).toContain('maturity_date')
    expect(prompt).toContain('vencimiento')
    expect(prompt).toContain('"violation"')
  })
})

describe('parseAddedLines', () => {
  it('returns added lines with accurate new-file line numbers', () => {
    const diff = [
      'diff --git a/x.py b/x.py',
      '--- a/x.py',
      '+++ b/x.py',
      '@@ -1,3 +1,4 @@',
      ' context0',
      '+added1',
      ' context2',
      '+added3',
      '-removed',
    ].join('\n')
    expect(parseAddedLines(diff)).toEqual([
      { n: 2, text: 'added1' },
      { n: 4, text: 'added3' },
    ])
  })

  it('handles multiple hunks with independent new-file offsets', () => {
    const diff = [
      '@@ -1,1 +1,2 @@',
      ' a',
      '+b',
      '@@ -50,1 +51,2 @@',
      ' c',
      '+d',
    ].join('\n')
    expect(parseAddedLines(diff)).toEqual([
      { n: 2, text: 'b' },
      { n: 52, text: 'd' },
    ])
  })

  it('ignores the +++ header and "\\ No newline" markers', () => {
    const diff = ['+++ b/x.py', '@@ -1 +1 @@', '+real', '\\ No newline at end of file'].join('\n')
    expect(parseAddedLines(diff)).toEqual([{ n: 1, text: 'real' }])
  })

  it('returns [] for an empty diff', () => {
    expect(parseAddedLines('')).toEqual([])
  })
})
