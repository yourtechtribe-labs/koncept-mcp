#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from './args.js'
import { runInit } from './commands/init.js'
import { runVerify } from './commands/verify.js'
import { runList } from './commands/list.js'
import { runLink } from './commands/link.js'
import { runAffected } from './commands/affected.js'
import { VERSION } from './version.js'

const HELP = `koncepto ${VERSION}

Usage:
  koncepto init                       Bootstrap .koncept/ in cwd
  koncepto verify                     Validate concepts and write index.json
       [--no-suggestions]                  (suppress auto-link suggestions)
  koncepto list [--type] [--tag]      List concepts (with optional filters)
       [--status]
  koncepto link <id> <file>           Add a participant to an existing concept
       --role=<r> --purpose=<p>
  koncepto affected [--from <ref>]    Report concepts/invariants touched by a diff
       [--files=a,b,c] [--json]

Flags:
  --help, --version
`

export interface CommandContext {
  rootDir: string
  positional: string[]
  flags: Record<string, string | boolean>
}

type Handler = (ctx: CommandContext) => Promise<number>

const COMMANDS: Record<string, Handler> = {
  init: runInit,
  verify: runVerify,
  list: runList,
  link: runLink,
  affected: runAffected,
}

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const { command, positional, flags } = parseArgs(argv)

  if (flags.help || command === 'help') {
    process.stdout.write(HELP)
    return 0
  }
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  if (command === null) {
    process.stdout.write(HELP)
    return 0
  }

  const handler = COMMANDS[command]
  if (!handler) {
    process.stderr.write(`koncepto: unknown command "${command}"\n${HELP}`)
    return 64
  }

  return handler({ rootDir: resolve(cwd), positional, flags })
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedAsScript) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`koncepto: fatal: ${String(err)}\n`)
      process.exit(1)
    })
}
