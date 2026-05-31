#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from './args.js'
import { runInit } from './commands/init.js'
import { runVerify } from './commands/verify.js'
import { runList } from './commands/list.js'
import { runLink } from './commands/link.js'
import { runAffected } from './commands/affected.js'
import { runCheck } from './commands/check.js'
import { runReview } from './commands/review.js'
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
       [--require-ack]                     (exit 3 if an advisory high invariant is unacked)
       [--ack=c:i,c2:i2]                   (acknowledge invariants; supplements commit trailers)
  koncepto check                      Execute invariant.check payloads (grep + command)
       [--id <concept-id>]                 (filter to one concept)
       [--json]                            (machine-readable output)
  koncepto review [--from <ref>]      LLM review of touched advisory invariants
       [--files=a,b,c] [--json]            (requires ANTHROPIC_API_KEY)
       [--severity high|medium|low]        (min severity to review; default medium)
       [--strict] [--model <id>]           (--strict: exit 1 on any 'violated')

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
  check: runCheck,
  review: runReview,
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

/**
 * True when this module is the process entrypoint (i.e. run as a CLI).
 *
 * `import.meta.url` is realpath-resolved by Node's ESM loader, but
 * `process.argv[1]` is NOT: package managers expose the bin as a symlink
 * (npm `node_modules/.bin/koncepto`, pnpm's `.pnpm` store indirection).
 * Comparing the two raw paths therefore never matches under `pnpm run` /
 * `npx` / `node_modules/.bin`, so the CLI silently no-ops (exit 0, no
 * output). Resolve argv[1] through realpath before comparing so symlinked
 * bin invocations are detected correctly.
 */
function invokedAsScript(): boolean {
  const argv1 = process.argv[1]
  if (argv1 === undefined) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href
  } catch {
    return false
  }
}

if (invokedAsScript()) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`koncepto: fatal: ${String(err)}\n`)
      process.exit(1)
    })
}
