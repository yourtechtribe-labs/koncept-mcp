import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
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

  it('renders the classification summary line', async () => {
    await writeSampleConcept({ severity: 'high' })
    await runAffected({ rootDir: tmp, positional: [], flags: { files: 'src.ts' } })
    expect(stdout).toContain('Summary:')
    expect(stdout).toContain('advisory')
  })

  it('--require-ack exits 3 when an advisory_high invariant is unacknowledged', async () => {
    await writeSampleConcept({ severity: 'high' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts', 'require-ack': true },
    })
    expect(code).toBe(3)
    expect(stdout).toContain('sample:must-hold')
  })

  it('--require-ack exits 0 when the invariant is acked via --ack', async () => {
    await writeSampleConcept({ severity: 'high' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts', 'require-ack': true, ack: 'sample:must-hold' },
    })
    expect(code).toBe(0)
  })

  it('exits 2 on a malformed --ack entry', async () => {
    await writeSampleConcept({ severity: 'high' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts', 'require-ack': true, ack: 'no-colon-here' },
    })
    expect(code).toBe(2)
    expect(stderr).toContain('invalid --ack entry')
  })

  it('without --require-ack, exit stays 1 on a high invariant (unchanged)', async () => {
    await writeSampleConcept({ severity: 'high' })
    const code = await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts', ack: 'sample:must-hold' },
    })
    expect(code).toBe(1)
  })

  it('--json includes klass per invariant and the summary block', async () => {
    await writeSampleConcept({ severity: 'high' })
    await runAffected({
      rootDir: tmp,
      positional: [],
      flags: { files: 'src.ts', json: true, 'require-ack': true },
    })
    const parsed = JSON.parse(stdout) as {
      concepts: Array<{ invariants: Array<{ klass: string; acknowledged?: boolean }> }>
      summary: { advisory_high: number; unacknowledged_high: number }
    }
    expect(parsed.concepts[0].invariants[0].klass).toBe('advisory')
    expect(parsed.concepts[0].invariants[0].acknowledged).toBe(false)
    expect(parsed.summary.advisory_high).toBe(1)
    expect(parsed.summary.unacknowledged_high).toBe(1)
  })

  // End-to-end over the real git path (no --files): exercises the NUL-split of
  // `git diff --name-only -z` and the commit-trailer ack source together.
  describe('git diff + trailer-ack path', () => {
    function git(cwd: string, args: string[]): void {
      const r = spawnSync('git', args, { cwd, encoding: 'utf-8' })
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
    }

    async function initRepoWithConcept(): Promise<void> {
      await writeSampleConcept({ severity: 'high' })
      git(tmp, ['init', '-q'])
      git(tmp, ['config', 'user.email', 't@t.co'])
      git(tmp, ['config', 'user.name', 't'])
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'base'])
    }

    it('resolves changed files from git diff -z and gates on the unacked high', async () => {
      await initRepoWithConcept()
      await writeFile(join(tmp, 'src.ts'), '// changed\n', 'utf-8')
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'edit src'])

      const code = await runAffected({
        rootDir: tmp,
        positional: [],
        flags: { from: 'HEAD~1', 'require-ack': true },
      })
      expect(code).toBe(3)
      expect(stdout).toContain('sample') // the diff path actually matched the file
    })

    it('passes when the touched high is acked via a commit trailer', async () => {
      await initRepoWithConcept()
      await writeFile(join(tmp, 'src.ts'), '// changed\n', 'utf-8')
      git(tmp, ['add', '-A'])
      git(tmp, [
        'commit',
        '-q',
        '-m',
        'edit src\n\nKoncepto-Reviewed: sample:must-hold',
      ])

      const code = await runAffected({
        rootDir: tmp,
        positional: [],
        flags: { from: 'HEAD~1', 'require-ack': true },
      })
      expect(code).toBe(0)
    })
  })
})
