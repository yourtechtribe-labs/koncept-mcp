import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runAffected } from '../src/commands/affected.js'

describe('koncepto affected', () => {
  let tmp: string
  let stdout: string
  let stderr: string
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-affected-'))
    await mkdir(join(tmp, '.koncept/concepts'), { recursive: true })
    stdout = ''
    stderr = ''
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
      stdout += typeof c === 'string' ? c : c.toString()
      return true
    })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      stderr += typeof c === 'string' ? c : c.toString()
      return true
    })
  })

  afterEach(async () => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    await rm(tmp, { recursive: true, force: true })
  })

  async function writeSampleConcept(opts: {
    id?: string
    file?: string
    severity?: 'high' | 'medium' | 'low'
  } = {}): Promise<void> {
    const id = opts.id ?? 'sample'
    const file = opts.file ?? 'src.ts'
    const severity = opts.severity ?? 'high'
    await writeFile(join(tmp, file), '// fixture\n', 'utf-8')
    await writeFile(
      join(tmp, '.koncept/concepts', `${id}.yaml`),
      `id: ${id}
name: Sample
type: data-flow
description: Demo.
source_of_truth:
  file: ${file}
participants:
  - file: ${file}
    role: writer
    purpose: Demo.
invariants:
  - id: must-hold
    description: Critical invariant.
    severity: ${severity}
created: 2026-05-03
last_updated: 2026-05-03
`,
      'utf-8',
    )
  }

  it('returns 1 and reports the concept when a high invariant is touched', async () => {
    await writeSampleConcept({ severity: 'high' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts' },
    })
    expect(code).toBe(1)
    expect(stdout).toContain('1 concept(s) affected')
    expect(stdout).toContain('sample')
    expect(stdout).toContain('[high]')
  })

  it('returns 0 when no concept matches the changed files', async () => {
    await writeSampleConcept()
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'unrelated.md' },
    })
    expect(code).toBe(0)
    expect(stdout).toContain('0 concept(s) affected')
  })

  it('returns 0 for matched concepts without high invariants', async () => {
    await writeSampleConcept({ severity: 'medium' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts' },
    })
    expect(code).toBe(0)
    expect(stdout).toContain('1 concept(s) affected')
  })

  it('emits valid JSON with --json', async () => {
    await writeSampleConcept({ severity: 'high' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts', json: true },
    })
    expect(code).toBe(1)
    const parsed = JSON.parse(stdout) as {
      concepts: Array<{ id: string; max_severity: string }>
      changed_files: string[]
      unmatched_files: string[]
    }
    expect(parsed.changed_files).toEqual(['src.ts'])
    expect(parsed.concepts).toHaveLength(1)
    expect(parsed.concepts[0].id).toBe('sample')
    expect(parsed.concepts[0].max_severity).toBe('high')
  })

  it('accepts comma-separated --files', async () => {
    await writeSampleConcept({ severity: 'low' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts, unrelated.md' },
    })
    expect(code).toBe(0)
    expect(stdout).toContain('1 file(s) without any concept')
    expect(stdout).toContain('unrelated.md')
  })
})
