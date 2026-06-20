// @yourtechtribe-labs/koncept-core — public API.
// Greenfield: keep the surface intentional. Internal helpers (regexes,
// constants, sub-schemas) stay un-exported.

export { VERSION } from './version.js'

// Schema — top-level types + main schemas. Sub-schemas (Participant, Invariant,
// SourceOfTruth) and the kebab-id regex stay internal.
export {
  ConceptSchema,
  IndexEntrySchema,
  RoleEnum,
  ConceptTypeEnum,
  SeverityEnum,
  StatusEnum,
  AutomatedCheckSchema,
  ParticipantSelectorSchema,
  LinkTypeEnum,
  LinkRefSchema,
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
  AutomatedCheck,
  ParticipantSelector,
  LinkType,
  LinkRef,
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

// Affected (impact analysis)
export { computeAffected, resolveRelatedIds } from './affected.js'
export type {
  AffectedReport,
  AffectedConcept,
  AffectedInvariant,
  MatchedRole,
} from './affected.js'

// Classification & sign-off (klass, summary, acks)
export { classifyCheck, ackKey } from './classify.js'
export type { InvariantClass, AffectedSummary } from './classify.js'

// Concept loader (fs bridge for the pure graph functions)
export { loadConcepts } from './load-concepts.js'
export type { LoadConceptsResult } from './load-concepts.js'

// Auto-link inference
export { suggestLinks } from './suggest-links.js'
export type { LinkSuggestion, SuggestLinksOptions } from './suggest-links.js'

// Checker (invariant.check executor)
export { runChecks } from './checker.js'
export type {
  CheckOptions,
  CheckStatus,
  InvariantCheckResult,
  CheckResult,
} from './checker.js'

// Review (LLM semantic reviewer — pure; llm + diff injected by the CLI)
export { parseVerdict, reviewAffected, buildPrompt } from './review.js'
export type {
  Verdict,
  InvariantReview,
  ReviewResult,
  ReviewOptions,
} from './review.js'
