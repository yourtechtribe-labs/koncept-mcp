export const KEBAB_ID_REGEX = /^[a-z][a-z0-9-]+$/

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}
