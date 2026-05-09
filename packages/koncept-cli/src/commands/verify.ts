import {
  indexConcepts,
  isIndexClean,
  loadConcepts,
  suggestLinks,
  writeIndex,
  type LinkSuggestion,
} from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'

export async function runVerify(ctx: CommandContext): Promise<number> {
  const result = await indexConcepts(ctx.rootDir)
  await writeIndex(ctx.rootDir, result.entries)

  const quiet = ctx.flags.quiet === true
  const wantSuggestions = ctx.flags['no-suggestions'] !== true
  if (!quiet) {
    process.stdout.write(`koncepto verify: ${result.entries.length} concept(s) indexed\n`)
  }

  if (isIndexClean(result)) {
    if (!quiet) process.stdout.write('koncepto verify: ✓ all checks passed\n')
    if (wantSuggestions && !quiet) {
      const loaded = await loadConcepts(ctx.rootDir)
      printSuggestions(suggestLinks(loaded.concepts))
    }
    return 0
  }

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
