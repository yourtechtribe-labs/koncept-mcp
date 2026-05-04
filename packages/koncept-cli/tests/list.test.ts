import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runList } from '../src/commands/list.js'

describe('koncepto list', () => {
  let tmp: string
  let stdout: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-list-'))
    await mkdir(join(tmp, '.koncept/concepts'), { recursive: true })
    await writeFile(join(tmp, 'src.ts'), '// fixture\n', 'utf-8')
    await writeConcept(tmp, 'auth.yaml', conceptYaml('auth-flow', 'data-flow', ['auth']))
    await writeConcept(tmp, 'csrf.yaml', conceptYaml('csrf-policy', 'architectural-decision', ['security']))
    await writeConcept(
      tmp,
      'inv.yaml',
      conceptYaml('login-rules', 'behavioral-invariant', ['auth']),
    )

    stdout = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk)
      return true
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  it('lists every concept by default', async () => {
    const code = await runList({ rootDir: tmp, positional: [], flags: {} })
    expect(code).toBe(0)
    expect(stdout).toContain('auth-flow')
    expect(stdout).toContain('csrf-policy')
    expect(stdout).toContain('login-rules')
  })

  it('filters by --type', async () => {
    await runList({ rootDir: tmp, positional: [], flags: { type: 'data-flow' } })
    expect(stdout).toContain('auth-flow')
    expect(stdout).not.toContain('csrf-policy')
    expect(stdout).not.toContain('login-rules')
  })

  it('filters by --tag', async () => {
    await runList({ rootDir: tmp, positional: [], flags: { tag: 'auth' } })
    expect(stdout).toContain('auth-flow')
    expect(stdout).toContain('login-rules')
    expect(stdout).not.toContain('csrf-policy')
  })

  it('filters by --status', async () => {
    await runList({ rootDir: tmp, positional: [], flags: { status: 'active' } })
    expect(stdout).toContain('auth-flow')
  })
})

function conceptYaml(id: string, type: string, tags: string[]): string {
  return `id: ${id}
name: ${id}
type: ${type}
description: Test.
source_of_truth:
  file: src.ts
participants:
  - file: src.ts
    role: writer
    purpose: t.
tags: [${tags.join(', ')}]
created: 2026-05-03
last_updated: 2026-05-03
`
}

async function writeConcept(dir: string, file: string, body: string): Promise<void> {
  await writeFile(join(dir, '.koncept/concepts', file), body, 'utf-8')
}
