import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runVerify } from '../src/commands/verify.js'

describe('koncepto verify', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-verify-'))
    await mkdir(join(tmp, '.koncept/concepts'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  async function writeConcept(filename: string, body: string): Promise<void> {
    await writeFile(join(tmp, '.koncept/concepts', filename), body, 'utf-8')
  }

  it('returns 0 and writes index.json on a clean fixture', async () => {
    await writeFile(join(tmp, 'src.ts'), '// fixture\n', 'utf-8')
    await writeConcept(
      'sample.yaml',
      `id: sample
name: Sample
type: data-flow
description: Demo concept.
source_of_truth:
  file: src.ts
participants:
  - file: src.ts
    role: writer
    purpose: Demo writer.
created: 2026-05-03
last_updated: 2026-05-03
`,
    )
    const code = await runVerify({ rootDir: tmp, positional: [], flags: {} })
    expect(code).toBe(0)
    const idx = JSON.parse(await readFile(join(tmp, '.koncept/index.json'), 'utf-8'))
    expect(idx).toHaveLength(1)
    expect(idx[0].id).toBe('sample')
  })

  it('returns 1 on unresolved related_concepts', async () => {
    await writeFile(join(tmp, 'src.ts'), '// fixture\n', 'utf-8')
    await writeConcept(
      'broken.yaml',
      `id: broken
name: Broken
type: data-flow
description: Has dangling related ref.
source_of_truth:
  file: src.ts
participants:
  - file: src.ts
    role: writer
    purpose: x.
related_concepts:
  - does-not-exist
created: 2026-05-03
last_updated: 2026-05-03
`,
    )
    const code = await runVerify({ rootDir: tmp, positional: [], flags: {} })
    expect(code).toBe(1)
  })
})
