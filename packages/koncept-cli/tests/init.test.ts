import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runInit } from '../src/commands/init.js'

describe('koncepto init', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-init-'))
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  async function exists(p: string): Promise<boolean> {
    try {
      await stat(p)
      return true
    } catch {
      return false
    }
  }

  it('bootstraps .koncept/ structure on empty dir', async () => {
    const code = await runInit({ rootDir: tmp, positional: [], flags: {} })
    expect(code).toBe(0)
    expect(await exists(join(tmp, '.koncept'))).toBe(true)
    expect(await exists(join(tmp, '.koncept/concepts'))).toBe(true)

    const index = await readFile(join(tmp, '.koncept/index.json'), 'utf-8')
    expect(JSON.parse(index)).toEqual([])

    const readme = await readFile(join(tmp, '.koncept/README.md'), 'utf-8')
    expect(readme.length).toBeGreaterThan(50)
    expect(readme).toMatch(/koncept/i)
  })

  it('is idempotent — re-running does not fail or overwrite hand-edited README', async () => {
    await runInit({ rootDir: tmp, positional: [], flags: {} })

    const readmePath = join(tmp, '.koncept/README.md')
    const customMark = '\n\n## My custom notes\n'
    const original = await readFile(readmePath, 'utf-8')
    await import('node:fs/promises').then((fs) => fs.writeFile(readmePath, original + customMark))

    const code = await runInit({ rootDir: tmp, positional: [], flags: {} })
    expect(code).toBe(0)

    const after = await readFile(readmePath, 'utf-8')
    expect(after).toContain(customMark)
  })
})
