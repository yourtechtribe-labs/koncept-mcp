import {
  computeAffected,
  loadConcepts,
  type AffectedReport,
} from '@yourtechtribe-labs/koncept-core'
import type { CommandContext } from '../index.js'
import { gatherAcks } from './acks.js'
import { resolveChangedFiles } from './git.js'

export interface AffectedOptions {
  rootDir: string
  from: string
  filesOverride: string[] | null
  json: boolean
  requireAck: boolean
  ackCsv: string | null
}

export async function runAffected(ctx: CommandContext): Promise<number> {
  const opts = parseOptions(ctx)
  const filesResult = resolveChangedFiles(opts.rootDir, opts.from, opts.filesOverride)
  if (!filesResult.ok) {
    process.stderr.write(`koncepto affected: ${filesResult.error}\n`)
    return 2
  }

  let acks: ReadonlySet<string> | undefined
  if (opts.requireAck) {
    const gathered = gatherAcks({
      rootDir: opts.rootDir,
      from: opts.from,
      useGit: opts.filesOverride === null,
      ackCsv: opts.ackCsv,
    })
    if (!gathered.ok) {
      process.stderr.write(`koncepto affected: ${gathered.error}\n`)
      return 2
    }
    acks = gathered.acks
  }

  const loaded = await loadConcepts(opts.rootDir)
  if (loaded.parseErrors.length > 0 && !opts.json) {
    for (const e of loaded.parseErrors) {
      process.stderr.write(
        `koncepto affected: warning: parse error in ${e.filePath}: ${e.message}\n`,
      )
    }
  }

  const report = computeAffected(loaded.concepts, filesResult.files, acks)

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    renderReport(report, opts.requireAck)
  }

  return exitCodeFor(report, opts.requireAck)
}

function parseOptions(ctx: CommandContext): AffectedOptions {
  const fromFlag = ctx.flags.from
  const filesFlag = ctx.flags.files
  const filesOverride =
    typeof filesFlag === 'string'
      ? filesFlag
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : null
  return {
    rootDir: ctx.rootDir,
    from: typeof fromFlag === 'string' ? fromFlag : 'HEAD',
    filesOverride,
    json: ctx.flags.json === true,
    requireAck: ctx.flags['require-ack'] === true,
    ackCsv: typeof ctx.flags.ack === 'string' ? ctx.flags.ack : null,
  }
}

function renderReport(report: AffectedReport, requireAck: boolean): void {
  const totalInvariants = report.concepts.reduce((n, c) => n + c.invariants.length, 0)
  process.stdout.write(
    `${report.concepts.length} concept(s) affected (${totalInvariants} invariant(s)) over ${report.changed_files.length} changed file(s)\n`,
  )
  for (const c of report.concepts) {
    const sevTag = c.max_severity ? ` [${c.max_severity}]` : ''
    process.stdout.write(`\n  ${c.id}${sevTag} — ${c.name}\n`)
    for (const m of c.matched_files) {
      process.stdout.write(`    touched: ${m.file} (${m.role})\n`)
    }
    for (const inv of c.invariants) {
      process.stdout.write(`    invariant ${inv.invariant_id} [${inv.severity}] (${invariantTag(inv)}): ${inv.description}\n`)
    }
    for (const f of c.other_participants) {
      process.stdout.write(`    review also: ${f}\n`)
    }
  }
  if (report.unmatched_files.length > 0) {
    process.stdout.write(`\n  ${report.unmatched_files.length} file(s) without any concept:\n`)
    for (const f of report.unmatched_files) {
      process.stdout.write(`    ${f}\n`)
    }
  }
  renderSummary(report, requireAck)
}

function invariantTag(inv: AffectedReport['concepts'][number]['invariants'][number]): string {
  if (inv.klass !== 'advisory') return inv.klass
  return inv.acknowledged === false ? 'advisory, UNACKED' : 'advisory'
}

function renderSummary(report: AffectedReport, requireAck: boolean): void {
  const s = report.summary
  process.stdout.write(
    `\n  Summary: ${s.automated} automated · ${s.advisory} advisory · ${s.advisory_high} high needing review · ${s.unacknowledged_high} unacknowledged\n`,
  )
  if (requireAck && s.unacknowledged_high > 0) {
    renderAckGate(report)
  }
}

function renderAckGate(report: AffectedReport): void {
  process.stdout.write(
    `  ✗ ${report.summary.unacknowledged_high} unacknowledged high-severity invariant(s) — sign off with a\n`,
  )
  for (const c of report.concepts) {
    for (const inv of c.invariants) {
      if (inv.klass === 'advisory' && inv.severity === 'high' && inv.acknowledged === false) {
        process.stdout.write(
          `    'Koncepto-Reviewed: ${inv.concept_id}:${inv.invariant_id}' commit trailer, or --ack. (exit 3)\n`,
        )
      }
    }
  }
}

function exitCodeFor(report: AffectedReport, requireAck: boolean): number {
  if (requireAck) {
    return report.summary.unacknowledged_high > 0 ? 3 : 0
  }
  for (const c of report.concepts) {
    for (const inv of c.invariants) {
      if (inv.severity === 'high') return 1
    }
  }
  return 0
}
