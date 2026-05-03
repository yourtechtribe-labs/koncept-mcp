/**
 * Cross-platform path normalization for koncepto.
 *
 * YAML files store participant paths as forward-slash relative paths
 * (Unix-style). On Windows the filesystem returns backslashes; we normalize
 * everywhere we read/write paths so equality + globs are consistent.
 */

import { resolve, basename as nodeBasename, isAbsolute } from 'node:path'

/**
 * Convert all backslashes to forward slashes.
 * Works on both Windows (`C:\foo\bar` → `C:/foo/bar`) and Unix (no-op).
 */
export function normalizeForward(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Resolve a (possibly relative) path against a root, then return a forward-slash
 * normalized absolute path.
 */
export function resolveRelative(rootDir: string, relative: string): string {
  const absolute = isAbsolute(relative) ? relative : resolve(rootDir, relative)
  return normalizeForward(absolute)
}

/**
 * Cross-platform basename. Stripped of extension if `stripExt` is true.
 */
export function basename(p: string, stripExt = false): string {
  const name = nodeBasename(normalizeForward(p))
  if (!stripExt) return name
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
