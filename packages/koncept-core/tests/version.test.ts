import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { VERSION } from '../src/index.js'

describe('VERSION', () => {
  it('matches the version field in koncept-core/package.json (no hardcoding)', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8')) as {
      version: string
    }
    expect(VERSION).toBe(pkg.version)
  })
})
