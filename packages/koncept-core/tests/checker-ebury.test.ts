import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { runChecks } from '../src/checker.js'

// Regression: the Ebury #301 catch. A standalone treasury sync that invalidates the
// banking cache but NOT the projection cache must be flagged by an `implication` check
// — the same thing a standalone pytest fitness function caught in 0.33s, now first-class.

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'fixtures', 'ebury')
const SERVICE_REL = 'backend/app/services/sync/ebury/service.py'

let tmpRoot = ''
afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true })
  tmpRoot = ''
})

describe('Ebury regression — treasury-data-sync-completeness', () => {
  it('flags the offender: references BankingCacheService but not CacheInvalidationService', async () => {
    const result = await runChecks({ cwd: FIXTURE })
    expect(result.failed).toBe(1)
    const r = result.results[0]
    expect(r.conceptId).toBe('treasury-data-sync-completeness')
    expect(r.invariantId).toBe('invalidate-projection-cache')
    expect(r.kind).toBe('implication')
    expect(r.status).toBe('fail')
    expect(r.detail).toContain(SERVICE_REL)
    // description is surfaced as the remediation hint
    expect(r.description).toContain('projection cache')
  })

  it('passes once the projection cache invalidation is added (fix direction)', async () => {
    // Copy the fixture to a temp dir and patch the service to also reference the
    // projection cache — proving the check goes green when the loose end is closed.
    tmpRoot = mkdtempSync(join(tmpdir(), 'koncept-ebury-'))
    cpSync(FIXTURE, tmpRoot, { recursive: true })
    const svc = join(tmpRoot, SERVICE_REL)
    mkdirSync(dirname(svc), { recursive: true })
    writeFileSync(
      svc,
      'BankingCacheService().invalidate(c)\nCacheInvalidationService().on_full_sync(c)\n',
    )

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(0)
  })
})
