import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runLink } from '../src/commands/link.js'

describe('koncepto link', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-link-'))
    await mkdir(join(tmp, '.koncept/concepts'), { recursive: true })
    await writeFile(join(tmp, 'src.ts'), '// fixture\n', 'utf-8')
    await writeFile(join(tmp, 'extra.ts'), '// fixture 2\n', 'utf-8')
    await writeFile(
      join(tmp, '.koncept/concepts/sample.yaml'),
      `id: sample
name: Sample
type: data-flow
description: Demo.
source_of_truth:
  file: src.ts
participants:
  - file: src.ts
    role: writer
    purpose: First writer.
created: 2026-05-03
last_updated: 2026-05-03
`,
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('appends a participant to an existing concept', async () => {
    const code = await runLink({
      rootDir: tmp,
      positional: ['sample', 'extra.ts'],
      flags: { role: 'reader', purpose: 'Reads sample.' },
    })
    expect(code).toBe(0)

    const yaml = await readFile(join(tmp, '.koncept/concepts/sample.yaml'), 'utf-8')
    expect(yaml).toContain('extra.ts')
    expect(yaml).toContain('reader')
    expect(yaml).toContain('Reads sample.')
  })

  it('rejects an unknown concept id', async () => {
    const code = await runLink({
      rootDir: tmp,
      positional: ['does-not-exist', 'extra.ts'],
      flags: { role: 'reader', purpose: 'X.' },
    })
    expect(code).toBe(1)
  })

  it('rejects duplicate file+role on the same concept', async () => {
    const code = await runLink({
      rootDir: tmp,
      positional: ['sample', 'src.ts'],
      flags: { role: 'writer', purpose: 'Duplicate.' },
    })
    expect(code).toBe(1)
  })

  it('preserves comments and key order on round-trip (parseDocument API)', async () => {
    const annotated = `# Top comment — explains intent
id: with-comments
name: With Comments
type: data-flow
description: Demo with comments.
source_of_truth:
  file: src.ts
participants:
  # First participant — keep this comment
  - file: src.ts
    role: writer
    purpose: First.
created: 2026-05-03
last_updated: 2026-05-03
`
    await writeFile(join(tmp, '.koncept/concepts/comments.yaml'), annotated, 'utf-8')

    const code = await runLink({
      rootDir: tmp,
      positional: ['with-comments', 'extra.ts'],
      flags: { role: 'reader', purpose: 'New reader.' },
    })
    expect(code).toBe(0)

    const after = await readFile(join(tmp, '.koncept/concepts/comments.yaml'), 'utf-8')
    expect(after).toContain('# Top comment — explains intent')
    expect(after).toContain('# First participant — keep this comment')
    expect(after).toContain('extra.ts')
    expect(after.indexOf('id:')).toBeLessThan(after.indexOf('name:'))
  })

  it('rejects when --role or --purpose missing', async () => {
    const code = await runLink({
      rootDir: tmp,
      positional: ['sample', 'extra.ts'],
      flags: { role: 'reader' },
    })
    expect(code).toBe(2)
  })
})
