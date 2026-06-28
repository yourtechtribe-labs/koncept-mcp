import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server.js'
import { registerAllTools } from '../src/tools/index.js'

interface ToolPayload {
  structuredContent?: Record<string, unknown>
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as ToolPayload
  return res.structuredContent ?? {}
}

describe('koncept_lint_naming MCP tool', () => {
  let tmp: string
  let client: Client
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'koncepto-lint-tool-'))
    await mkdir(join(tmp, '.koncept/concepts'), { recursive: true })
    await writeFile(join(tmp, 'dict.md'), '# data dictionary\n', 'utf-8')
    await writeFile(
      join(tmp, 'loan.py'),
      'def f():\n    next_maturity = 1\n    maturity_date = invoice.due_date\n',
      'utf-8',
    )
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

    const { mcp } = createServer({ rootDir: tmp })
    registerAllTools(mcp, { rootDir: tmp })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'koncept-test-client', version: '0.0.0' })
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])
    cleanup = async () => {
      await client.close()
      await mcp.close()
    }
  })

  afterAll(async () => {
    await cleanup()
    await rm(tmp, { recursive: true, force: true })
  })

  it('exposes koncept_lint_naming as a read-only tool', async () => {
    const { tools } = (await client.listTools()) as {
      tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>
    }
    const tool = tools.find((t) => t.name === 'koncept_lint_naming')
    expect(tool).toBeDefined()
    expect(tool?.annotations?.readOnlyHint).toBe(true)
  })

  it('returns the prohibited-alias candidate with canonical, term, and line', async () => {
    const out = (await call(client, 'koncept_lint_naming', { files: ['loan.py'] })) as {
      candidates: Array<{
        alias: string
        canonical: string
        term: string | null
        file: string
        line: number
        text: string
        rubric: string
      }>
      rules_applied: number
      note: string
    }
    expect(out.rules_applied).toBe(1)
    expect(out.candidates).toHaveLength(1) // only the forbidden alias line, not next_maturity
    const c = out.candidates[0]
    expect(c.alias).toBe('maturity_date')
    expect(c.canonical).toBe('next_maturity')
    expect(c.term).toBe('vencimiento')
    expect(c.file).toBe('loan.py')
    expect(c.line).toBe(3)
    expect(c.text).toContain('maturity_date')
    expect(out.note.toLowerCase()).toContain('judge')
  })

  it('reports unreadable files instead of throwing', async () => {
    const out = (await call(client, 'koncept_lint_naming', {
      files: ['does-not-exist.py'],
    })) as { candidates: unknown[]; unreadable_files: string[] }
    expect(out.candidates).toEqual([])
    expect(out.unreadable_files).toEqual(['does-not-exist.py'])
  })
})
