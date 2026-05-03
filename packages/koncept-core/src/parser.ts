/**
 * YAML parser for koncepto concept files.
 *
 * Two-step pipeline:
 *  1. YAML parse via `yaml` v2 (with size + alias-count guards) → captures syntax errors
 *  2. Zod validate → captures schema mismatches
 *
 * Always returns a structured ParseResult; never throws.
 *
 * Security (OWASP A04 Insecure Design): explicit DoS guards on untrusted YAML.
 *  - MAX_YAML_BYTES caps payload size (rejects >100 KB before parse).
 *  - MAX_ALIAS_COUNT caps alias expansion (billion-laughs mitigation).
 * yaml >= 2.8.3 fixes CVE-2026-33532 stack-overflow; these are defense-in-depth
 * (concept YAML may originate from third-party PRs in OSS context).
 */

import { readFile } from 'node:fs/promises'
import YAML from 'yaml'
import { ConceptSchema, type Concept } from './schema.js'

const MAX_YAML_BYTES = 100 * 1024 // 100 KB — concepts are small structured docs
const MAX_ALIAS_COUNT = 50 // explicit billion-laughs / alias-bomb guard

export type ParseErrorType = 'yaml_syntax' | 'schema_validation' | 'io_error' | 'unknown'

export interface ParseError {
  type: ParseErrorType
  message: string
  field?: string // dotted path for schema_validation errors
}

export interface ParseResult {
  concept: Concept | null
  errors: ParseError[]
  filePath: string
}

/**
 * Parse a YAML string in memory.
 * @param yamlText raw YAML content
 * @param filePath identifier (no fs read; just metadata for error context)
 */
export function parseConceptString(yamlText: string, filePath: string): ParseResult {
  // DoS guard 1: byte-size limit (UTF-8) before any parsing work. `string.length`
  // returns UTF-16 code units, which under-counts multi-byte content.
  const byteLength = Buffer.byteLength(yamlText, 'utf8')
  if (byteLength > MAX_YAML_BYTES) {
    return {
      concept: null,
      errors: [
        {
          type: 'yaml_syntax',
          message: `YAML exceeds size limit (${byteLength} > ${MAX_YAML_BYTES} bytes)`,
        },
      ],
      filePath,
    }
  }

  let raw: unknown
  try {
    // DoS guard 2: cap alias expansion (billion-laughs mitigation).
    raw = YAML.parse(yamlText, { maxAliasCount: MAX_ALIAS_COUNT })
  } catch (err) {
    return {
      concept: null,
      errors: [
        {
          type: 'yaml_syntax',
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      filePath,
    }
  }

  const result = ConceptSchema.safeParse(raw)
  if (!result.success) {
    return {
      concept: null,
      errors: result.error.issues.map((issue) => ({
        type: 'schema_validation' as const,
        message: issue.message,
        field: issue.path.length > 0 ? issue.path.join('.') : undefined,
      })),
      filePath,
    }
  }

  return { concept: result.data, errors: [], filePath }
}

/**
 * Read + parse a YAML concept file from disk.
 */
export async function parseConceptFile(filePath: string): Promise<ParseResult> {
  let text: string
  try {
    text = await readFile(filePath, 'utf-8')
  } catch (err) {
    return {
      concept: null,
      errors: [
        {
          type: 'io_error',
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      filePath,
    }
  }
  return parseConceptString(text, filePath)
}
