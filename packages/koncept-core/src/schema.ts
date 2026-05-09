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

// AutomatedCheck — discriminated union describing HOW (if at all) the
// invariant is verified. `kind: none` = manual reviewer (default).
// `kind: grep` = regex over participant files. `kind: command` = escape hatch
// running an arbitrary shell command (the runner decides safety policy).
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
  file: z.string().min(1),
})
export type IndexEntry = z.infer<typeof IndexEntrySchema>
