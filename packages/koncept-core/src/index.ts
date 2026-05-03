// @yourtechtribe-labs/koncept-core — public API.
// Greenfield: keep the surface intentional. Internal helpers (regexes,
// constants, sub-schemas) stay un-exported.

export const VERSION = '0.1.0-alpha.0'

// Schema — top-level types + main schemas. Sub-schemas (Participant, Invariant,
// SourceOfTruth) and the kebab-id regex stay internal.
export {
  ConceptSchema,
  IndexEntrySchema,
  RoleEnum,
  ConceptTypeEnum,
  SeverityEnum,
  StatusEnum,
} from './schema.js'
export type {
  Concept,
  IndexEntry,
  Participant,
  Invariant,
  SourceOfTruth,
  Role,
  ConceptType,
  Severity,
  Status,
} from './schema.js'

// Parser
export { parseConceptString, parseConceptFile } from './parser.js'
export type { ParseResult, ParseError, ParseErrorType } from './parser.js'

// Indexer
export { indexConcepts, writeIndex, isIndexClean } from './indexer.js'
export type {
  IndexResult,
  IndexErrorEntry,
  DuplicateId,
  UnresolvedRelated,
  MissingFile,
} from './indexer.js'

// Search
export { searchEntries } from './search.js'
export type { SearchHit, MatchField } from './search.js'
