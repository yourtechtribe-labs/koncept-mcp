import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { runLintNaming } from '../src/commands/lint-naming.js'

function git(cwd: string, args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
}

function stubLlm(reply: string | { throw: true }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (typeof reply === 'object') throw new Error('network down')
      const body = JSON.stringify({ content: [{ type: 'text', text: reply }] })
      return new Response(body, { status: 200 })
    }),
  )
}

describe('koncepto lint-naming', () => {
  let tmp: string
  let stdout: string
  let stderr: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  /** Init a repo whose HEAD commit ADDS a line containing the forbidden alias. */
  async function initRepoAddingAlias(addedLine: string): Promise<void> {
    await mkdir(join(tmp, '.koncept/concepts'), { recursive: true })
    await writeFile(join(tmp, 'dict.md'), '# data dictionary\n', 'utf-8')
    await writeFile(join(tmp, 'loan.py'), 'def base():\n    pass\n', 'utf-8')
    await writeFile(
      join(tmp, '.koncept/concepts/naming.yaml'),
      `id: naming-vencimiento
name: Vencimiento naming
type: naming-convention
description: next_maturity is canonical for a revolving maturity.
source_of_truth:
  file: dict.md
glossary_terms: [vencimiento]
naming:
  canonical: next_maturity
  forbidden: [maturity_date, expiration_date]
created: 2026-06-28
last_updated: 2026-06-28
`,
      'utf-8',
    )
    git(tmp, ['init', '-q'])
    git(tmp, ['config', 'user.email', 't@t.co'])
    git(tmp, ['config', 'user.name', 't'])
    git(tmp, ['add', '-A'])
    git(tmp, ['commit', '-q', '-m', 'base'])
    await writeFile(join(tmp, 'loan.py'), `def base():\n    ${addedLine}\n`, 'utf-8')
    git(tmp, ['add', '-A'])
    git(tmp, ['commit', '-q', '-m', 'edit'])
  }

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-lint-'))
    stdout = ''
    stderr = ''
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
      stdout += typeof c === 'string' ? c : c.toString()
      return true
    })
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      stderr += typeof c === 'string' ? c : c.toString()
      return true
    })
  })

  afterEach(async () => {
    outSpy.mockRestore()
    errSpy.mockRestore()
    vi.unstubAllGlobals()
    delete process.env.ANTHROPIC_API_KEY
    await rm(tmp, { recursive: true, force: true })
  })

  it('exits 0 with "0 candidates" when the diff has no forbidden alias (no key needed)', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await initRepoAddingAlias('next_maturity = 1') // canonical, not forbidden
    const code = await runLintNaming({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1' } })
    expect(code).toBe(0)
    expect(stdout).toContain('0 candidates')
  })

  it('exits 2 when there ARE candidates but ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await initRepoAddingAlias('maturity_date = 1')
    const code = await runLintNaming({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1' } })
    expect(code).toBe(2)
    expect(stderr).toContain('ANTHROPIC_API_KEY')
  })

  it('judges a candidate and exits 0 by default (advisory) even on a violation', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoAddingAlias('maturity_date = 1')
    stubLlm('{"violation": true, "reason": "real domain symbol"}')
    const code = await runLintNaming({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1' } })
    expect(code).toBe(0)
    expect(stdout).toContain('next_maturity')
    expect(stdout).toContain('1 violation')
  })

  it('--strict exits 1 on a real violation', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoAddingAlias('maturity_date = 1')
    stubLlm('{"violation": true, "reason": "r"}')
    const code = await runLintNaming({
      rootDir: tmp,
      positional: [],
      flags: { from: 'HEAD~1', strict: true },
    })
    expect(code).toBe(1)
  })

  it('--strict exits 0 when the judge says it is NOT a violation', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoAddingAlias('maturity_date = 1') // an incidental match, judged false
    stubLlm('{"violation": false, "reason": "it is in a comment"}')
    const code = await runLintNaming({
      rootDir: tmp,
      positional: [],
      flags: { from: 'HEAD~1', strict: true },
    })
    expect(code).toBe(0)
  })

  it('--json emits findings + counts', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoAddingAlias('maturity_date = 1')
    stubLlm('{"violation": true, "reason": "real"}')
    await runLintNaming({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1', json: true } })
    const parsed = JSON.parse(stdout) as {
      findings: Array<{ alias: string; canonical: string; violation: boolean }>
      violations: number
      candidates: number
    }
    expect(parsed.candidates).toBe(1)
    expect(parsed.violations).toBe(1)
    expect(parsed.findings[0].alias).toBe('maturity_date')
    expect(parsed.findings[0].canonical).toBe('next_maturity')
  })

  it('exits 2 when the LLM call fails, tagged with file:line(alias)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoAddingAlias('maturity_date = 1')
    stubLlm({ throw: true })
    const code = await runLintNaming({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1' } })
    expect(code).toBe(2)
    expect(stderr).toContain('loan.py:')
    expect(stderr).toContain('maturity_date')
  })
})
