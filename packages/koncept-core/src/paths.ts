/**
 * Cross-platform path normalization for koncepto.
 *
 * YAML files store participant paths as forward-slash relative paths
 * (Unix-style). On Windows the filesystem returns backslashes; we normalize
 * everywhere we read/write paths so equality + globs are consistent.
 */

import { resolve, basename as nodeBasename, isAbsolute } from 'node:path'

/**
 * Convert all backslashes to forward slashes and strip the Windows
 * extended-length path prefix (`\\?\` → empty).
 *
 * Node's `path.resolve` and `glob` may return paths prefixed with `\\?\` on
 * Windows when the resolved path could exceed MAX_PATH. The prefix is an
 * implementation detail of Win32 — leaking it through public APIs (MCP tool
 * outputs, indexed `file` entries) confuses downstream consumers.
 */
export function normalizeForward(p: string): string {
  const forward = p.replace(/\\/g, '/')
  return forward.startsWith('//?/') ? forward.slice(4) : forward
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
