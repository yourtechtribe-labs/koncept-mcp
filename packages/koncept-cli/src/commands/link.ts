import { readFile, writeFile } from 'node:fs/promises'
import { parseDocument, isMap, isSeq } from 'yaml'
import { indexConcepts } from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'

const VALID_ROLES = ['writer', 'reader', 'tester', 'docs'] as const
type Role = (typeof VALID_ROLES)[number]

export async function runLink(ctx: CommandContext): Promise<number> {
  const [conceptId, file] = ctx.positional
  const role = ctx.flags.role
  const purpose = ctx.flags.purpose

  if (!conceptId || !file) {
    process.stderr.write('koncepto link: usage: koncepto link <id> <file> --role=<r> --purpose=<p>\n')
    return 2
  }
  if (typeof role !== 'string' || typeof purpose !== 'string') {
    process.stderr.write('koncepto link: --role and --purpose are required\n')
    return 2
  }
  if (!VALID_ROLES.includes(role as Role)) {
    process.stderr.write(
      `koncepto link: invalid role "${role}". Must be one of ${VALID_ROLES.join(', ')}\n`,
    )
    return 2
  }

  const index = await indexConcepts(ctx.rootDir)
  const entry = index.entries.find((e) => e.id === conceptId)
  if (!entry) {
    process.stderr.write(`koncepto link: concept "${conceptId}" not found\n`)
    return 1
  }

  const text = await readFile(entry.file, 'utf-8')
  const doc = parseDocument(text)
  const participants = doc.get('participants')
  if (!isSeq(participants)) {
    process.stderr.write(
      `koncepto link: concept "${conceptId}" has no participants sequence\n`,
    )
    return 1
  }

  const dup = participants.items.some(
    (item) =>
      isMap(item) && item.get('file') === file && item.get('role') === role,
  )
  if (dup) {
    process.stderr.write(
      `koncepto link: participant {file: "${file}", role: "${role}"} already exists on "${conceptId}"\n`,
    )
    return 1
  }

  participants.add({ file, role, purpose })
  doc.set('last_updated', today())

  await writeFile(entry.file, String(doc), 'utf-8')
  process.stdout.write(`koncepto link: added ${role} on ${file} to ${conceptId}\n`)
  return 0
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
