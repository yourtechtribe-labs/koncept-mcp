import { describe, it, expect } from 'vitest'
import { normalizeForward, resolveRelative, basename } from '../src/paths.js'

describe('normalizeForward', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeForward('C:\\foo\\bar')).toBe('C:/foo/bar')
  })

  it('is no-op on already-forward paths', () => {
    expect(normalizeForward('foo/bar/baz')).toBe('foo/bar/baz')
  })

  it('handles mixed separators', () => {
    expect(normalizeForward('foo\\bar/baz')).toBe('foo/bar/baz')
  })

  it('strips Windows extended-length UNC prefix (\\\\?\\)', () => {
    expect(normalizeForward('\\\\?\\C:\\Users\\x\\file.yaml')).toBe('C:/Users/x/file.yaml')
  })

  it('strips //?/ form (already-forward UNC prefix)', () => {
    expect(normalizeForward('//?/C:/Users/x/file.yaml')).toBe('C:/Users/x/file.yaml')
  })
})

describe('resolveRelative', () => {
  it('resolves a relative path against rootDir', () => {
    const result = resolveRelative('/tmp/koncept', 'concepts/x.yaml')
    expect(result).toMatch(/koncept\/concepts\/x\.yaml$/)
    expect(result).not.toContain('\\')
  })

  it('returns absolute path unchanged (modulo separators)', () => {
    const abs = '/abs/path/file.ts'
    const result = resolveRelative('/tmp/koncept', abs)
    expect(result).toBe(abs)
  })
})

describe('basename', () => {
  it('returns the file name with extension by default', () => {
    expect(basename('foo/bar/baz.yaml')).toBe('baz.yaml')
  })

  it('strips extension when requested', () => {
    expect(basename('foo/bar/baz.yaml', true)).toBe('baz')
  })

  it('handles backslash paths', () => {
    expect(basename('C:\\foo\\baz.yaml', true)).toBe('baz')
  })

  it('keeps name when no extension', () => {
    expect(basename('foo/README', true)).toBe('README')
  })
})
