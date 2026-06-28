import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { normalizeForward, resolveRelative, basename, resolveWithinRoot } from '../src/paths.js'

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

describe('resolveWithinRoot', () => {
  const root = resolve('/tmp/project-root')

  it('returns the resolved absolute path for an in-root relative path', () => {
    expect(resolveWithinRoot(root, 'src/loan.py')).toBe(resolve(root, 'src/loan.py'))
  })

  it('allows `..` segments that stay within the root', () => {
    expect(resolveWithinRoot(root, 'src/../loan.py')).toBe(resolve(root, 'loan.py'))
  })

  it('returns the root itself for "."', () => {
    expect(resolveWithinRoot(root, '.')).toBe(root)
  })

  it('rejects a `../` traversal that escapes the root', () => {
    expect(resolveWithinRoot(root, '../../etc/passwd')).toBeNull()
  })

  it('rejects a sibling escape (../sibling)', () => {
    expect(resolveWithinRoot(root, '../sibling/file.ts')).toBeNull()
  })

  it('rejects an absolute path pointing outside the root', () => {
    expect(resolveWithinRoot(root, resolve('/tmp/elsewhere/x.ts'))).toBeNull()
  })

  it('does not treat a sibling sharing a name prefix as inside (root-foo vs root)', () => {
    // `${root}-foo` startsWith `${root}` textually, but is NOT under `${root}/`
    expect(resolveWithinRoot(root, '../project-root-foo/x.ts')).toBeNull()
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
