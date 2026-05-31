import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server.js'
import { registerAllTools } from '../src/tools/index.js'
import { registerAllResources } from '../src/resources/index.js'

const FIXTURE_ROOT = resolve(
  fileURLToPath(new URL('./fixtures/', import.meta.url)),
)

interface ToolPayload {
  structuredContent?: Record<string, unknown>
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as ToolPayload
  return res.structuredContent ?? {}
}

describe('koncept-mcp-server stdio tools', () => {
  let client: Client
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const { mcp } = createServer({ rootDir: FIXTURE_ROOT })
    registerAllTools(mcp, { rootDir: FIXTURE_ROOT })
    registerAllResources(mcp, { rootDir: FIXTURE_ROOT })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'koncept-test-client', version: '0.0.0' })

    await Promise.all([
      mcp.connect(serverTransport),
      client.connect(clientTransport),
    ])

    cleanup = async () => {
      await client.close()
      await mcp.close()
    }
  })

  afterAll(async () => {
    await cleanup()
  })

  it('koncept_get returns the auth-flow concept', async () => {
    const out = (await call(client, 'koncept_get', { id: 'auth-flow' })) as {
      concept?: { id: string; invariants: unknown[] }
    }
    expect(out.concept?.id).toBe('auth-flow')
    expect(out.concept?.invariants.length).toBe(2)
  })

  it('koncept_get returns not_found for missing id', async () => {
    const out = (await call(client, 'koncept_get', { id: 'does-not-exist' })) as {
      error?: string
    }
    expect(out.error).toBe('not_found')
  })

  it('koncept_get returns invalid_id for malformed id', async () => {
    const out = (await call(client, 'koncept_get', { id: 'BadId' })) as {
      error?: string
    }
    expect(out.error).toBe('invalid_id')
  })

  it('koncept_search ranks exact id first', async () => {
    const out = (await call(client, 'koncept_search', { query: 'auth-flow' })) as {
      matches: Array<{ id: string; score: number }>
    }
    expect(out.matches[0]?.id).toBe('auth-flow')
    expect(out.matches[0]?.score).toBeGreaterThanOrEqual(1)
  })

  it('koncept_search finds by tag', async () => {
    const out = (await call(client, 'koncept_search', { query: 'security' })) as {
      matches: Array<{ id: string }>
    }
    const ids = out.matches.map((m) => m.id).sort()
    expect(ids).toContain('auth-flow')
    expect(ids).toContain('csrf-policy')
  })

  it('koncept_for_file returns matches for a participant path', async () => {
    const out = (await call(client, 'koncept_for_file', {
      path: 'src/auth/provider.ts',
    })) as { matches: Array<{ id: string; role: string; purpose: string }> }
    expect(out.matches.length).toBe(1)
    expect(out.matches[0]?.id).toBe('auth-flow')
    expect(out.matches[0]?.role).toBe('writer')
  })

  it('koncept_for_file returns empty array for unknown path', async () => {
    const out = (await call(client, 'koncept_for_file', {
      path: 'src/unknown.ts',
    })) as { matches: unknown[] }
    expect(out.matches).toEqual([])
  })

  it('koncept_invariants_at_scope by file path', async () => {
    const out = (await call(client, 'koncept_invariants_at_scope', {
      scope: 'src/auth/provider.ts',
    })) as { invariants: Array<{ invariant_id: string; severity: string }> }
    const ids = out.invariants.map((i) => i.invariant_id).sort()
    expect(ids).toContain('tokens-not-in-localstorage')
    expect(ids).toContain('refresh-cookie-httponly')
  })

  it('koncept_invariants_at_scope by concept id', async () => {
    const out = (await call(client, 'koncept_invariants_at_scope', {
      scope: 'csrf-policy',
    })) as { invariants: Array<{ invariant_id: string }> }
    expect(out.invariants).toHaveLength(1)
    expect(out.invariants[0]?.invariant_id).toBe('csrf-on-mutations')
  })

  it('koncept_affected reports concepts touched by a file', async () => {
    const out = (await call(client, 'koncept_affected', {
      files: ['src/auth/provider.ts'],
    })) as {
      concepts: Array<{ id: string; max_severity: string | null }>
      unmatched_files: string[]
    }
    expect(out.concepts.map((c) => c.id)).toEqual(['auth-flow'])
    expect(out.concepts[0].max_severity).toBe('high')
    expect(out.unmatched_files).toEqual([])
  })

  it('koncept_affected tags each invariant with klass and emits a summary (read-only, no acks)', async () => {
    const out = (await call(client, 'koncept_affected', {
      files: ['src/auth/provider.ts'],
    })) as {
      concepts: Array<{ invariants: Array<{ klass: string; acknowledged?: boolean }> }>
      summary: { automated: number; advisory: number; advisory_high: number; unacknowledged_high: number }
    }
    expect(out.concepts[0].invariants[0].klass).toMatch(/^(advisory|automated)$/)
    // ack-mode is off for the MCP tool (it never passes acks) — no acknowledgment surfaced
    expect(out.concepts[0].invariants[0].acknowledged).toBeUndefined()
    expect(out.summary.unacknowledged_high).toBe(0)
    expect(typeof out.summary.advisory).toBe('number')
  })

  it('koncept_affected lists unmatched files separately', async () => {
    const out = (await call(client, 'koncept_affected', {
      files: ['src/auth/provider.ts', 'README.md'],
    })) as {
      concepts: Array<{ id: string }>
      unmatched_files: string[]
    }
    expect(out.concepts).toHaveLength(1)
    expect(out.unmatched_files).toEqual(['README.md'])
  })

  it('lists resources including the static index and per-concept entries', async () => {
    const res = (await client.listResources()) as {
      resources: Array<{ uri: string; name: string }>
    }
    const uris = res.resources.map((r) => r.uri).sort()
    expect(uris).toContain('koncept://concepts')
    expect(uris).toContain('koncept://concept/auth-flow')
    expect(uris).toContain('koncept://concept/csrf-policy')
  })

  it('reads the static koncept://concepts index as JSON', async () => {
    const res = (await client.readResource({ uri: 'koncept://concepts' })) as {
      contents: Array<{ uri: string; mimeType?: string; text?: string }>
    }
    expect(res.contents[0].mimeType).toBe('application/json')
    const payload = JSON.parse(res.contents[0].text ?? '[]') as Array<{
      id: string
      uri: string
    }>
    expect(payload.map((p) => p.id).sort()).toEqual(['auth-flow', 'csrf-policy'])
    expect(payload[0].uri).toMatch(/^koncept:\/\/concept\//)
  })

  it('reads a single concept by uri template', async () => {
    const res = (await client.readResource({
      uri: 'koncept://concept/auth-flow',
    })) as { contents: Array<{ text?: string }> }
    const concept = JSON.parse(res.contents[0].text ?? '{}') as {
      id: string
      invariants: unknown[]
    }
    expect(concept.id).toBe('auth-flow')
    expect(concept.invariants.length).toBe(2)
  })

  it('returns a not_found payload for an unknown concept uri', async () => {
    const res = (await client.readResource({
      uri: 'koncept://concept/does-not-exist',
    })) as { contents: Array<{ text?: string }> }
    const body = JSON.parse(res.contents[0].text ?? '{}') as { error?: string }
    expect(body.error).toBe('not_found')
  })

  it('returns invalid_id for a malformed concept uri', async () => {
    const res = (await client.readResource({
      uri: 'koncept://concept/BadId',
    })) as { contents: Array<{ text?: string }> }
    const body = JSON.parse(res.contents[0].text ?? '{}') as { error?: string }
    expect(body.error).toBe('invalid_id')
  })
})
