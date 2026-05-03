import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseConceptString, parseConceptFile } from '../src/parser.js'

const VALID_YAML = `
id: sample-concept
name: Sample Concept
type: data-flow
description: A sample concept for parser tests.
source_of_truth:
  file: src/sample.ts
  symbol: doSomething
participants:
  - file: src/sample.ts
    role: writer
    purpose: implements the behavior
invariants:
  - id: must-be-pure
    description: Function must be pure
    severity: medium
related_concepts:
  - other-concept
tags:
  - sample
created: 2026-05-03
last_updated: 2026-05-03
`.trim()

describe('parseConceptString', () => {
  it('parses a valid YAML concept', () => {
    const result = parseConceptString(VALID_YAML, 'sample.yaml')
    expect(result.errors).toEqual([])
    expect(result.concept).not.toBeNull()
    expect(result.concept?.id).toBe('sample-concept')
    expect(result.concept?.participants).toHaveLength(1)
  })

  it('returns yaml_syntax error on malformed YAML', () => {
    const broken = 'id: x\n  bad: indent: more'
    const result = parseConceptString(broken, 'broken.yaml')
    expect(result.concept).toBeNull()
    expect(result.errors[0]?.type).toBe('yaml_syntax')
  })

  it('returns schema_validation error with field path on missing required field', () => {
    const incomplete = `
id: incomplete
type: data-flow
description: missing name
source_of_truth: { file: src/x.ts }
created: 2026-01-01
last_updated: 2026-01-01
`.trim()
    const result = parseConceptString(incomplete, 'incomplete.yaml')
    expect(result.concept).toBeNull()
    const nameError = result.errors.find((e) => e.field === 'name')
    expect(nameError).toBeDefined()
    expect(nameError?.type).toBe('schema_validation')
  })

  it('returns schema_validation error for bad enum', () => {
    const badEnum = VALID_YAML.replace('type: data-flow', 'type: bogus-type')
    const result = parseConceptString(badEnum, 'bad-enum.yaml')
    expect(result.concept).toBeNull()
    expect(result.errors.some((e) => e.field === 'type')).toBe(true)
  })

  it('preserves filePath in result', () => {
    const result = parseConceptString(VALID_YAML, 'foo/bar.yaml')
    expect(result.filePath).toBe('foo/bar.yaml')
  })

  it('rejects YAML over 100 KB (DoS size guard)', () => {
    const huge = 'description: "' + 'x'.repeat(120 * 1024) + '"\n'
    const result = parseConceptString(huge, 'huge.yaml')
    expect(result.concept).toBeNull()
    expect(result.errors[0]?.type).toBe('yaml_syntax')
    expect(result.errors[0]?.message).toMatch(/exceeds size limit/)
  })

  it('rejects YAML with excessive aliases (billion-laughs guard)', () => {
    const aliasBomb = `
a: &a 1
b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]
c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]
d: [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]
`.trim()
    const result = parseConceptString(aliasBomb, 'alias-bomb.yaml')
    expect(result.concept).toBeNull()
  })
})

describe('parseConceptFile', () => {
  it('reads + parses a real file from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'koncept-parser-'))
    const filePath = join(dir, 'sample.yaml')
    await writeFile(filePath, VALID_YAML, 'utf-8')

    try {
      const result = await parseConceptFile(filePath)
      expect(result.errors).toEqual([])
      expect(result.concept?.id).toBe('sample-concept')
      expect(result.filePath).toBe(filePath)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns io_error when file does not exist', async () => {
    const result = await parseConceptFile('/nonexistent/path/file.yaml')
    expect(result.concept).toBeNull()
    expect(result.errors[0]?.type).toBe('io_error')
  })
})
