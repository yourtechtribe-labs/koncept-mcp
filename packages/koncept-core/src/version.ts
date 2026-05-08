/**
 * Single source of truth for the package version: read at module init from
 * the package's own package.json. Avoids the drift trap where a hardcoded
 * constant lags behind the published version field.
 *
 * Layout invariant: in src/ during dev/test, and in dist/ after build, this
 * file sits exactly one directory above package.json — the relative offset is
 * the same in both cases, so a single `'../package.json'` URL works.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkgUrl = new URL('../package.json', import.meta.url)
const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), 'utf-8')) as {
  version: string
}

export const VERSION: string = pkg.version
