import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { runReview } from '../src/commands/review.js'

function git(cwd: string, args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
}

/** Stub global fetch to return one Anthropic-shaped reply (or throw). */
function stubLlm(reply: string | { throw: true; status?: number }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (typeof reply === 'object') {
        if (reply.status) {
          return new Response('upstream error', { status: reply.status })
        }
        throw new Error('network down')
      }
      const body = JSON.stringify({ content: [{ type: 'text', text: reply }] })
      return new Response(body, { status: 200 })
    }),
  )
}

describe('koncepto review', () => {
  let tmp: string
  let stdout: string
  let stderr: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  async function initRepoWithAdvisoryHigh(): Promise<void> {
    await mkdir(join(tmp, '.koncept/concepts'), { recursive: true })
    await writeFile(join(tmp, 'src.ts'), '// v1\n', 'utf-8')
    await writeFile(
      join(tmp, '.koncept/concepts/sample.yaml'),
      `id: sample
name: Sample
type: data-flow
description: Demo concept.
source_of_truth:
  file: src.ts
invariants:
  - id: must-hold
    description: The reader must rely on the index.
    severity: high
created: 2026-05-03
last_updated: 2026-05-03
`,
      'utf-8',
    )
    git(tmp, ['init', '-q'])
    git(tmp, ['config', 'user.email', 't@t.co'])
    git(tmp, ['config', 'user.name', 't'])
    git(tmp, ['add', '-A'])
    git(tmp, ['commit', '-q', '-m', 'base'])
    await writeFile(join(tmp, 'src.ts'), '// v2 changed\n', 'utf-8')
    git(tmp, ['add', '-A'])
    git(tmp, ['commit', '-q', '-m', 'edit'])
  }

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-review-'))
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

  it('exits 2 when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await initRepoWithAdvisoryHigh()
    const code = await runReview({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1' } })
    expect(code).toBe(2)
    expect(stderr).toContain('ANTHROPIC_API_KEY')
  })

  it('reviews the advisory invariant and exits 0 by default (advisory)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoWithAdvisoryHigh()
    stubLlm('{"verdict":"violated","rationale":"introduces a Seq Scan"}')
    const code = await runReview({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1' } })
    expect(code).toBe(0) // advisory by default — violated does NOT fail
    expect(stdout).toContain('violated')
  })

  it('--strict exits 1 on a violated verdict', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoWithAdvisoryHigh()
    stubLlm('{"verdict":"violated","rationale":"r"}')
    const code = await runReview({
      rootDir: tmp,
      positional: [],
      flags: { from: 'HEAD~1', strict: true },
    })
    expect(code).toBe(1)
  })

  it('--strict still exits 0 when the only verdict is uncertain', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoWithAdvisoryHigh()
    stubLlm('{"verdict":"uncertain","rationale":"cannot tell"}')
    const code = await runReview({
      rootDir: tmp,
      positional: [],
      flags: { from: 'HEAD~1', strict: true },
    })
    expect(code).toBe(0)
  })

  it('--json emits the ReviewResult shape', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoWithAdvisoryHigh()
    stubLlm('{"verdict":"holds","rationale":"index still used"}')
    await runReview({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1', json: true } })
    const parsed = JSON.parse(stdout) as {
      reviews: Array<{ verdict: string; conceptId: string }>
      holds: number
    }
    expect(parsed.reviews[0].conceptId).toBe('sample')
    expect(parsed.reviews[0].verdict).toBe('holds')
    expect(parsed.holds).toBe(1)
  })

  it('exits 2 when the LLM call fails after retry, tagged with concept:invariant', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    await initRepoWithAdvisoryHigh()
    stubLlm({ throw: true })
    const code = await runReview({ rootDir: tmp, positional: [], flags: { from: 'HEAD~1' } })
    expect(code).toBe(2)
    expect(stderr).toContain('sample:must-hold')
  })
})
