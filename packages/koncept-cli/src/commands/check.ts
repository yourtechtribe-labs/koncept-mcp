import { runChecks, type CheckResult, type InvariantCheckResult } from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runCheck(ctx: CommandContext): Promise<number> {
  const filterId = typeof ctx.flags.id === 'string' ? ctx.flags.id : undefined
  const json = ctx.flags.json === true

  const result = await runChecks({ cwd: ctx.rootDir, filterId })

  if (json) {
    renderJson(result)
  } else {
    renderTable(result)
  }

  return exitCode(result)
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function renderTable(result: CheckResult): void {
  const total = result.results.length
  const concepts = new Set(result.results.map((r) => r.conceptId)).size
  process.stdout.write(`koncepto check — ${concepts} concept(s), ${total} invariant(s)\n\n`)

  for (const r of result.results) {
    const symbol = statusSymbol(r.status)
    const line = [
      '  ',
      r.conceptId.padEnd(24),
      r.invariantId.padEnd(28),
      r.kind.padEnd(9),
      symbol,
      r.status,
    ].join(' ')
    process.stdout.write(line + '\n')
    if (r.detail) {
      process.stdout.write(`                └─ ${r.detail}\n`)
    }
  }

  process.stdout.write(
    `\n  Results: ${result.passed} passed · ${result.failed} failed · ${result.skipped} skipped · ${result.errors} errors\n`,
  )
}

function renderJson(result: CheckResult): void {
  const output = {
    results: result.results,
    summary: {
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      errors: result.errors,
    },
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusSymbol(status: InvariantCheckResult['status']): string {
  switch (status) {
    case 'pass':  return '✓'
    case 'fail':  return '✗'
    case 'skip':  return '–'
    case 'error': return '!'
  }
}

function exitCode(result: CheckResult): number {
  if (result.errors > 0) return 2
  if (result.failed > 0) return 1
  return 0
}
