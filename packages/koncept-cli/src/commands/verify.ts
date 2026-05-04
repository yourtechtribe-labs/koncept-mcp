import {
  indexConcepts,
  isIndexClean,
  writeIndex,
} from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'

export async function runVerify(ctx: CommandContext): Promise<number> {
  const result = await indexConcepts(ctx.rootDir)
  await writeIndex(ctx.rootDir, result.entries)

  const quiet = ctx.flags.quiet === true
  if (!quiet) {
    process.stdout.write(`koncepto verify: ${result.entries.length} concept(s) indexed\n`)
  }

  if (isIndexClean(result)) {
    if (!quiet) process.stdout.write('koncepto verify: ✓ all checks passed\n')
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
