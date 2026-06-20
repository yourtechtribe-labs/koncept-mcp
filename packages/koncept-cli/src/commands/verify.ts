import {
  indexConcepts,
  isIndexClean,
  loadConcepts,
  runChecks,
  suggestLinks,
  writeIndex,
  type InvariantCheckResult,
  type LinkSuggestion,
} from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'

export async function runVerify(ctx: CommandContext): Promise<number> {
  const result = await indexConcepts(ctx.rootDir)
  await writeIndex(ctx.rootDir, result.entries)

  const quiet = ctx.flags.quiet === true
  const wantSuggestions = ctx.flags['no-suggestions'] !== true
  const wantChecks = ctx.flags['no-checks'] !== true
  if (!quiet) {
    process.stdout.write(`koncepto verify: ${result.entries.length} concept(s) indexed\n`)
  }

  if (isIndexClean(result)) {
    // Structural validation passed. Now run the STATIC invariant checks (#36) by
    // default — fast, read-only, deterministic. `kind: command` is never run here
    // (staticOnly), it stays exclusive to `koncepto check`. `--no-checks` opts out.
    if (wantChecks) {
      const checks = await runChecks({ cwd: ctx.rootDir, staticOnly: true })
      if (checks.failed + checks.errors > 0) {
        printCheckFailures(checks.results)
        return 1
      }
    }

    if (!quiet) process.stdout.write('koncepto verify: ✓ all checks passed\n')
    if (wantSuggestions && !quiet) {
      const loaded = await loadConcepts(ctx.rootDir)
      printSuggestions(suggestLinks(loaded.concepts))
    }
    return 0
  }

  // Structural errors present → don't run checks (we can't trust the graph).

  for (const e of result.errors) {
    process.stderr.write(`✗ parse: ${e.filePath}\n`)
    for (const err of e.errors) {
      process.stderr.write(`    ${err.type}${err.field ? ` @ ${err.field}` : ''}: ${err.message}\n`)
    }
  }
  for (const d of result.duplicateIds) {
    process.stderr.write(`✗ duplicate id "${d.id}" in:\n`)
    for (const f of d.files) process.stderr.write(`    ${f}\n`)
  }
  for (const u of result.unresolvedRelated) {
    process.stderr.write(
      `✗ unresolved related: "${u.conceptId}" → "${u.missingRelatedId}"\n`,
    )
  }
  for (const m of result.missingFiles) {
    process.stderr.write(
      `✗ missing participant file: "${m.conceptId}" → "${m.missingFile}"\n`,
    )
  }

  return 1
}

function printCheckFailures(results: InvariantCheckResult[]): void {
  process.stderr.write('koncepto verify: ✗ invariant check failed\n\n')
  for (const r of results) {
    if (r.status !== 'fail' && r.status !== 'error') continue
    const mark = r.status === 'error' ? '⚠' : '✗'
    process.stderr.write(`  ${mark} ${r.conceptId} / ${r.invariantId}  (${r.kind})\n`)
    if (r.detail) process.stderr.write(`      ${r.detail}\n`)
    if (r.description) process.stderr.write(`      → ${r.description.trim()}\n`)
  }
}

function printSuggestions(suggestions: LinkSuggestion[]): void {
  if (suggestions.length === 0) return
  process.stdout.write(
    `\nSuggestions (${suggestions.length}, not blocking — pass --no-suggestions to silence):\n`,
  )
  for (const s of suggestions) {
    process.stdout.write(`  ◦ ${s.a} ↔ ${s.b}\n`)
    if (s.shared_participants.length > 0) {
      process.stdout.write(
        `      shared participants: ${s.shared_participants.join(', ')}\n`,
      )
    }
    if (s.shared_tags.length > 0) {
      process.stdout.write(`      shared tags: ${s.shared_tags.join(', ')}\n`)
    }
  }
}
