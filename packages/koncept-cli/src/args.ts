export interface ParsedArgs {
  command: string | null
  positional: string[]
  flags: Record<string, string | boolean>
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []
  let command: string | null = null
  let i = 0

  for (; i < argv.length; i++) {
    const tok = argv[i]
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=')
      if (eq > -1) {
        flags[tok.slice(2, eq)] = tok.slice(eq + 1)
      } else {
        const key = tok.slice(2)
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next
          i++
        } else {
          flags[key] = true
        }
      }
      continue
    }
    if (command === null) command = tok
    else positional.push(tok)
  }

  return { command, positional, flags }
}
