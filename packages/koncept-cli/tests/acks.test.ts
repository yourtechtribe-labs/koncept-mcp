import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { gatherAcks, parseAckCsv, parseReviewedTrailers } from '../src/commands/acks.js'

describe('parseAckCsv', () => {
  it('parses a comma-separated list of concept:invariant keys', () => {
    const r = parseAckCsv('c1:i1,c2:i2')
    expect(r).toEqual({ ok: true, keys: ['c1:i1', 'c2:i2'] })
  })

  it('trims whitespace and ignores empty segments', () => {
    const r = parseAckCsv(' c1:i1 , , c2:i2 ')
    expect(r).toEqual({ ok: true, keys: ['c1:i1', 'c2:i2'] })
  })

  it('rejects an entry without a colon', () => {
    const r = parseAckCsv('c1:i1,foo')
    expect(r).toEqual({ ok: false, bad: 'foo' })
  })

  it('returns an empty list for an empty string', () => {
    expect(parseAckCsv('')).toEqual({ ok: true, keys: [] })
  })
})

describe('parseReviewedTrailers', () => {
  it('extracts one ack key per trailer value line', () => {
    const out = 'c1:i1\nc2:i2\n'
    expect(parseReviewedTrailers(out)).toEqual(['c1:i1', 'c2:i2'])
  })

  it('ignores blank lines and trims values', () => {
    const out = '  c1:i1  \n\n c2:i2\n'
    expect(parseReviewedTrailers(out)).toEqual(['c1:i1', 'c2:i2'])
  })

  it('drops lines without a colon (not an ack key)', () => {
    const out = 'c1:i1\ngarbage\n'
    expect(parseReviewedTrailers(out)).toEqual(['c1:i1'])
  })

  it('returns empty for empty git output', () => {
    expect(parseReviewedTrailers('')).toEqual([])
  })
})

describe('gatherAcks against real git', () => {
  let tmp: string

  function git(cwd: string, args: string[]): void {
    const r = spawnSync('git', args, { cwd, encoding: 'utf-8' })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  }

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-acks-'))
    git(tmp, ['init', '-q'])
    git(tmp, ['config', 'user.email', 't@t.co'])
    git(tmp, ['config', 'user.name', 't'])
    await writeFile(join(tmp, 'a.txt'), 'a\n', 'utf-8')
    git(tmp, ['add', '-A'])
    git(tmp, ['commit', '-q', '-m', 'base'])
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('extracts Koncepto-Reviewed trailers from the from..HEAD range', () => {
    git(tmp, [
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'review\n\nKoncepto-Reviewed: my-concept:my-invariant\nKoncepto-Reviewed: c2:i2',
    ])
    const r = gatherAcks({ rootDir: tmp, from: 'HEAD~1', useGit: true, ackCsv: null })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([...r.acks].sort()).toEqual(['c2:i2', 'my-concept:my-invariant'])
  })

  it('unions trailer acks with --ack csv', () => {
    git(tmp, [
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'review\n\nKoncepto-Reviewed: from-trailer:i',
    ])
    const r = gatherAcks({ rootDir: tmp, from: 'HEAD~1', useGit: true, ackCsv: 'from-flag:i' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([...r.acks].sort()).toEqual(['from-flag:i', 'from-trailer:i'])
  })
})
