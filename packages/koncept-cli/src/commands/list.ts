import { indexConcepts, type IndexEntry } from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'

export async function runList(ctx: CommandContext): Promise<number> {
  const { entries } = await indexConcepts(ctx.rootDir)
  const filtered = applyFilters(entries, ctx.flags)

  if (filtered.length === 0) {
    process.stdout.write('koncepto list: no concepts match\n')
    return 0
  }

  for (const e of filtered) {
    process.stdout.write(
      `${e.id.padEnd(32)}  ${e.type.padEnd(24)}  ${e.status.padEnd(10)}  ${e.name}\n`,
    )
  }
  return 0
}

function applyFilters(
  entries: IndexEntry[],
  flags: Record<string, string | boolean>,
): IndexEntry[] {
  let out = entries
  const type = stringFlag(flags.type)
  if (type) out = out.filter((e) => e.type === type)
  const status = stringFlag(flags.status)
  if (status) out = out.filter((e) => e.status === status)
  const tag = stringFlag(flags.tag)
  if (tag) out = out.filter((e) => e.tags.includes(tag))
  return out
}

function stringFlag(v: string | boolean | undefined): string | null {
  return typeof v === 'string' ? v : null
}
