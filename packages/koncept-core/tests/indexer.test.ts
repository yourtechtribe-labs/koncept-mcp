import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { indexConcepts, isIndexClean, writeIndex } from '../src/indexer.js'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'koncept-idx-'))
  await mkdir(join(tmpRoot, '.koncept', 'concepts'), { recursive: true })
})

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true })
})

function yamlConcept(opts: {
  id: string
  participantFile?: string
  related?: string[]
}): string {
  const related = (opts.related ?? []).map((r) => `  - ${r}`).join('\n')
  const participant = opts.participantFile
    ? `participants:
  - file: ${opts.participantFile}
    role: writer
    purpose: implements`
    : 'participants: []'
  return `
id: ${opts.id}
name: Concept ${opts.id}
type: data-flow
description: test
source_of_truth: { file: dummy.ts }
${participant}
related_concepts:
${related || '  []'}
created: 2026-01-01
last_updated: 2026-01-01
`.trim()
}

describe('indexConcepts', () => {
  it('indexes a directory with valid concepts', async () => {
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'a.yaml'),
      yamlConcept({ id: 'a-concept' }),
    )
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'b.yaml'),
      yamlConcept({ id: 'b-concept' }),
    )

    const result = await indexConcepts(tmpRoot)
    expect(result.entries).toHaveLength(2)
    expect(result.entries.map((e) => e.id).sort()).toEqual(['a-concept', 'b-concept'])
    expect(isIndexClean(result)).toBe(true)
  })

  it('reports duplicate ids across two files', async () => {
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'a.yaml'),
      yamlConcept({ id: 'dup' }),
    )
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'b.yaml'),
      yamlConcept({ id: 'dup' }),
    )

    const result = await indexConcepts(tmpRoot)
    expect(result.duplicateIds).toHaveLength(1)
    expect(result.duplicateIds[0]?.id).toBe('dup')
    expect(result.duplicateIds[0]?.files).toHaveLength(2)
    expect(isIndexClean(result)).toBe(false)
  })

  it('reports unresolved related_concepts', async () => {
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'a.yaml'),
      yamlConcept({ id: 'a-concept', related: ['nonexistent-concept'] }),
    )

    const result = await indexConcepts(tmpRoot)
    expect(result.unresolvedRelated).toHaveLength(1)
    expect(result.unresolvedRelated[0]?.conceptId).toBe('a-concept')
    expect(result.unresolvedRelated[0]?.missingRelatedId).toBe('nonexistent-concept')
    expect(isIndexClean(result)).toBe(false)
  })

  it('reports missing participant files', async () => {
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'a.yaml'),
      yamlConcept({ id: 'a-concept', participantFile: 'src/missing.ts' }),
    )

    const result = await indexConcepts(tmpRoot)
    expect(result.missingFiles).toHaveLength(1)
    expect(result.missingFiles[0]?.missingFile).toBe('src/missing.ts')
    expect(isIndexClean(result)).toBe(false)
  })

  it('collects parse errors per file without aborting the rest', async () => {
    await writeFile(join(tmpRoot, '.koncept', 'concepts', 'good.yaml'), yamlConcept({ id: 'ok' }))
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'bad.yaml'),
      'id: bad\nbroken: : :',
    )

    const result = await indexConcepts(tmpRoot)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.id).toBe('ok')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.errors[0]?.type).toBe('yaml_syntax')
  })

  it('returns empty result for empty concepts dir', async () => {
    const result = await indexConcepts(tmpRoot)
    expect(result.entries).toEqual([])
    expect(isIndexClean(result)).toBe(true)
  })
})

describe('writeIndex', () => {
  it('writes index.json with denormalized entries', async () => {
    await writeFile(
      join(tmpRoot, '.koncept', 'concepts', 'a.yaml'),
      yamlConcept({ id: 'a-concept' }),
    )
    const result = await indexConcepts(tmpRoot)
    await writeIndex(tmpRoot, result.entries)

    const fs = await import('node:fs/promises')
    const raw = await fs.readFile(join(tmpRoot, '.koncept', 'index.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('a-concept')
  })
})
