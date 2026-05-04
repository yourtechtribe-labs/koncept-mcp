import { describe, it, expect } from 'vitest'
import { parseArgs } from '../src/args.js'

describe('parseArgs', () => {
  it('parses a bare command', () => {
    const r = parseArgs(['init'])
    expect(r).toEqual({ command: 'init', positional: [], flags: {} })
  })

  it('parses positionals + long flags with values', () => {
    const r = parseArgs(['link', 'auth-flow', 'src/x.ts', '--role=writer', '--purpose=writes'])
    expect(r.command).toBe('link')
    expect(r.positional).toEqual(['auth-flow', 'src/x.ts'])
    expect(r.flags.role).toBe('writer')
    expect(r.flags.purpose).toBe('writes')
  })

  it('parses --flag value (space-separated) form', () => {
    const r = parseArgs(['list', '--type', 'data-flow'])
    expect(r.flags.type).toBe('data-flow')
  })

  it('parses boolean --flag (no value)', () => {
    const r = parseArgs(['verify', '--quiet'])
    expect(r.flags.quiet).toBe(true)
  })

  it('returns command=null with no args', () => {
    const r = parseArgs([])
    expect(r.command).toBeNull()
  })

  it('treats --help and --version as flags on command=null', () => {
    expect(parseArgs(['--help']).flags.help).toBe(true)
    expect(parseArgs(['--version']).flags.version).toBe(true)
  })
})
