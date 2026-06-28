/**
 * koncepto schema — Zod definitions for the YAML concept format.
 *
 * One schema = (1) runtime validator, (2) TypeScript types via z.infer.
 * See spec § "Schema v0.1" for semantic intent.
 */

import { z } from 'zod'

// ─── Identifiers ─────────────────────────────────────────────────────────────

/**
 * Kebab-case strict regex for ids (concept id, invariant id, related_concepts).
 * Lowercase first char, then [a-z0-9-]. No leading/trailing hyphen, no consecutive
 * separators enforced softly via ^[a-z] start.
 */
export const KEBAB_ID_REGEX = /^[a-z][a-z0-9-]+$/

const KebabId = z.string().regex(KEBAB_ID_REGEX, {
  message: 'must be kebab-case (lowercase, [a-z0-9-]+, starts with letter)',
})

// ─── Enums ───────────────────────────────────────────────────────────────────

export const RoleEnum = z.enum(['writer', 'reader', 'tester', 'docs'])
export type Role = z.infer<typeof RoleEnum>

export const ConceptTypeEnum = z.enum([
  'behavioral-invariant',
  'architectural-decision',
  'data-flow',
  'ui-pattern',
  'naming-convention',
])
export type ConceptType = z.infer<typeof ConceptTypeEnum>

export const SeverityEnum = z.enum(['high', 'medium', 'low'])
export type Severity = z.infer<typeof SeverityEnum>

export const StatusEnum = z.enum(['active', 'deprecated', 'superseded'])
export type Status = z.infer<typeof StatusEnum>

// ─── Sub-objects ─────────────────────────────────────────────────────────────

export const SourceOfTruthSchema = z.object({
  symbol: z.string().min(1).optional(),
  file: z.string().min(1),
})
export type SourceOfTruth = z.infer<typeof SourceOfTruthSchema>

export const ParticipantSchema = z.object({
  file: z.string().min(1),
  role: RoleEnum,
  purpose: z.string().min(1),
})
export type Participant = z.infer<typeof ParticipantSchema>

// NamingSchema (K4) — declares the canonical name of a domain concept and the
// forbidden aliases for it. Only meaningful on `type: naming-convention`
// concepts; `koncepto lint-naming` reads `forbidden` as the prohibited-alias
// patterns to scan a diff for, and surfaces `canonical` as the remediation
// ("use `next_maturity`, not `maturity_date`"). Additive/optional — a concept
// without it is unchanged.
export const NamingSchema = z.object({
  canonical: z.string().min(1),
  forbidden: z.array(z.string().min(1)).min(1),
})
export type Naming = z.infer<typeof NamingSchema>

// ParticipantSelector — selects WHICH of a concept's declared participants a
// static check runs over (#36). v1: an optional `role` filter over the already-
// declared participant list. Absent selector → all participants. NO filesystem
// glob in v1 — that would need a glob dep (CONTRIBUTING "no new runtime deps")
// and an fs walk, breaking the cheap/hook-safe property that lets verify run it.
export const ParticipantSelectorSchema = z.object({
  role: RoleEnum.optional(),
})
export type ParticipantSelector = z.infer<typeof ParticipantSelectorSchema>

// AutomatedCheck — discriminated union describing HOW (if at all) the
// invariant is verified. `kind: none` = manual reviewer (default).
// `kind: grep` = regex over an explicit file list. `kind: command` = escape hatch
// running an arbitrary shell command (the runner decides safety policy).
//
// #36 static enforcement kinds run over the concept's PARTICIPANTS (per-file),
// are fast/read-only/deterministic, and are evaluated by `koncepto verify` by
// default (unlike `command`, which stays exclusive to `koncepto check`):
// - `implication`     — per file: if it matches `if`, it must also match `then`.
// - `symbol_present`  — every selected file must match `pattern`.
// - `forbidden`       — no selected file may match `pattern`.
// `symbol_present`/`forbidden` are exact sugar for per-file presence/absence
// using the same RegExp engine as `grep`; they differ only in source set
// (participants, not an explicit `in[]`) and aggregation (per-file, not any-file).
export const AutomatedCheckSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('grep'),
    pattern: z.string().min(1),
    in: z.array(z.string().min(1)).min(1),
    should_match: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('command'),
    cmd: z.string().min(1),
  }),
  z.object({
    kind: z.literal('implication'),
    over: ParticipantSelectorSchema.optional(),
    if: z.string().min(1),
    then: z.string().min(1),
  }),
  z.object({
    kind: z.literal('symbol_present'),
    over: ParticipantSelectorSchema.optional(),
    pattern: z.string().min(1),
  }),
  z.object({
    kind: z.literal('forbidden'),
    over: ParticipantSelectorSchema.optional(),
    pattern: z.string().min(1),
  }),
])
export type AutomatedCheck = z.infer<typeof AutomatedCheckSchema>

export const InvariantSchema = z.object({
  id: KebabId,
  description: z.string().min(1),
  severity: SeverityEnum,
  check: AutomatedCheckSchema.default({ kind: 'none' }),
})
export type Invariant = z.infer<typeof InvariantSchema>

// ─── Related concepts (typed links) ──────────────────────────────────────────

export const LinkTypeEnum = z.enum([
  'extends',
  'refines',
  'conflicts-with',
  'superseded-by',
  'requires',
  'related',
])
export type LinkType = z.infer<typeof LinkTypeEnum>

export const LinkRefSchema = z.union([
  KebabId,
  z.object({ id: KebabId, type: LinkTypeEnum.default('related') }),
])
export type LinkRef = z.infer<typeof LinkRefSchema>

// ─── Concept (top-level) ─────────────────────────────────────────────────────

export const ConceptSchema = z.object({
  id: KebabId,
  name: z.string().min(1),
  type: ConceptTypeEnum,
  status: StatusEnum.default('active'),
  description: z.string().min(1),

  source_of_truth: SourceOfTruthSchema,

  participants: z.array(ParticipantSchema).default([]),
  invariants: z.array(InvariantSchema).default([]),
  risks_if_broken: z.array(z.string().min(1)).default([]),
  related_concepts: z.array(LinkRefSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),

  // K3 — glossary term(s) this concept governs (closes the vocabulary↔invariant
  // loop). Free strings (like tags), NOT KebabId: they map to anchors in an
  // external data-dictionary whose convention koncepto does not own. Additive,
  // non-breaking (default []), same as related_concepts/tags.
  glossary_terms: z.array(z.string().min(1)).default([]),

  // K4 — naming-convention enforcement payload (canonical + forbidden aliases).
  // Optional; only read for `type: naming-convention` concepts by lint-naming.
  naming: NamingSchema.optional(),

  // Provenance
  created: z.string().min(1),
  last_updated: z.string().min(1),
  captured_by: z.string().optional(),
  references: z.array(z.string().min(1)).default([]),
})
export type Concept = z.infer<typeof ConceptSchema>

// ─── Index entry (denormalized for fast lookup) ──────────────────────────────

export const IndexEntrySchema = z.object({
  id: KebabId,
  name: z.string().min(1),
  type: ConceptTypeEnum,
  status: StatusEnum,
  participants_paths: z.array(z.string().min(1)),
  tags: z.array(z.string().min(1)),
  // K3 — denormalized so MCP search/for-file surface glossary terms without
  // reading the full YAML. Default [] keeps pre-K3 indexes valid.
  glossary_terms: z.array(z.string().min(1)).default([]),
  file: z.string().min(1),
})
export type IndexEntry = z.infer<typeof IndexEntrySchema>
