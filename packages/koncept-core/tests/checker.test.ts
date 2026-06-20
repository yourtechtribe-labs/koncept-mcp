import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runChecks } from '../src/checker.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a minimal .koncept/concepts/ dir with one YAML and returns rootDir */
function makeRepo(yaml: string): string {
  const root = mkdtempSync(join(tmpdir(), 'koncept-checker-'))
  const conceptsDir = join(root, '.koncept', 'concepts')
  mkdirSync(conceptsDir, { recursive: true })
  writeFileSync(join(conceptsDir, 'test-concept.yaml'), yaml)
  return root
}

const BASE_YAML = (checkBlock: string) => `
id: test-concept
name: Test Concept
type: behavioral-invariant
description: desc
source_of_truth:
  file: src/x.ts
participants:
  - file: src/x.ts
    role: writer
    purpose: writes
invariants:
  - id: test-inv
    description: test invariant
    severity: high
    check:
${checkBlock}
created: "2026-01-01"
last_updated: "2026-01-01"
`.trim()

let tmpRoot: string

beforeEach(() => {
  tmpRoot = ''
})

afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true })
})

// ─── kind: none ───────────────────────────────────────────────────────────────

describe('kind: none', () => {
  it('always skips — counts as skipped, not failed', async () => {
    tmpRoot = makeRepo(BASE_YAML('      kind: none'))
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.results[0].status).toBe('skip')
    expect(result.results[0].kind).toBe('none')
  })
})

// ─── kind: grep ───────────────────────────────────────────────────────────────

describe('kind: grep', () => {
  it('should_match:true — file contains pattern → pass', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(`      kind: grep\n      pattern: "hello"\n      in:\n        - src/x.ts`),
    )
    mkdirSync(join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(join(tmpRoot, 'src', 'x.ts'), 'const hello = 1')

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
    expect(result.results[0].status).toBe('pass')
  })

  it('should_match:true — file does NOT contain pattern → fail', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(`      kind: grep\n      pattern: "hello"\n      in:\n        - src/x.ts`),
    )
    mkdirSync(join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(join(tmpRoot, 'src', 'x.ts'), 'const world = 1')

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.failed).toBe(1)
    expect(result.results[0].status).toBe('fail')
    expect(result.results[0].detail).toContain('not found in')
  })

  it('should_match:false — file does NOT contain pattern → pass', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(
        `      kind: grep\n      pattern: "banned"\n      should_match: false\n      in:\n        - src/x.ts`,
      ),
    )
    mkdirSync(join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(join(tmpRoot, 'src', 'x.ts'), 'clean code here')

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
    expect(result.results[0].status).toBe('pass')
  })

  it('should_match:false — file CONTAINS pattern → fail (violation)', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(
        `      kind: grep\n      pattern: "banned"\n      should_match: false\n      in:\n        - src/x.ts`,
      ),
    )
    mkdirSync(join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(join(tmpRoot, 'src', 'x.ts'), 'const banned = true')

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.failed).toBe(1)
    expect(result.results[0].status).toBe('fail')
    expect(result.results[0].detail).toContain('found in')
  })

  it('file does not exist → error', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(`      kind: grep\n      pattern: "x"\n      in:\n        - src/missing.ts`),
    )

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.errors).toBe(1)
    expect(result.results[0].status).toBe('error')
    expect(result.results[0].detail).toContain('file not found')
  })

  it('invalid regex → error', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(`      kind: grep\n      pattern: "[invalid"\n      in:\n        - src/x.ts`),
    )
    mkdirSync(join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(join(tmpRoot, 'src', 'x.ts'), 'anything')

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.errors).toBe(1)
    expect(result.results[0].status).toBe('error')
    expect(result.results[0].detail).toContain('invalid regex')
  })
})

// ─── kind: command ────────────────────────────────────────────────────────────

describe('kind: command', () => {
  it('exit code 0 → pass', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(`      kind: command\n      cmd: "node -e \\"process.exit(0)\\""`),
    )

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
    expect(result.results[0].status).toBe('pass')
  })

  it('exit code 1 → fail with detail', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(
        `      kind: command\n      cmd: "node -e \\"process.stderr.write('oops');process.exit(1)\\""`,
      ),
    )

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.failed).toBe(1)
    expect(result.results[0].status).toBe('fail')
    expect(result.results[0].detail).toContain('oops')
  })

  it('non-existent command → error', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(`      kind: command\n      cmd: "this-command-does-not-exist-xyz-abc"`),
    )

    const result = await runChecks({ cwd: tmpRoot })
    // spawnSync with shell:true on a missing command exits with non-zero
    // (shell itself runs but command not found → exit 127 or similar)
    // Could be 'fail' or 'error' depending on OS; we only assert it's not 'pass'
    expect(result.results[0].status).not.toBe('pass')
  })
})

// ─── filterId ─────────────────────────────────────────────────────────────────

describe('filterId', () => {
  it('filters to only the specified concept', async () => {
    tmpRoot = makeRepo(BASE_YAML('      kind: none'))
    // Add a second concept that has a failing grep
    const conceptsDir = join(tmpRoot, '.koncept', 'concepts')
    writeFileSync(
      join(conceptsDir, 'other-concept.yaml'),
      `
id: other-concept
name: Other
type: behavioral-invariant
description: desc
source_of_truth:
  file: src/x.ts
invariants:
  - id: other-inv
    description: other
    severity: low
    check:
      kind: grep
      pattern: "SHOULD_NOT_EXIST_XYZ"
      in:
        - src/x.ts
created: "2026-01-01"
last_updated: "2026-01-01"
`.trim(),
    )
    mkdirSync(join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(join(tmpRoot, 'src', 'x.ts'), 'nothing here')

    // Only check test-concept → should skip (kind:none), not see other-concept's fail
    const result = await runChecks({ cwd: tmpRoot, filterId: 'test-concept' })
    expect(result.results).toHaveLength(1)
    expect(result.results[0].conceptId).toBe('test-concept')
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('unknown filterId → error result with concept-not-found detail', async () => {
    tmpRoot = makeRepo(BASE_YAML('      kind: none'))

    const result = await runChecks({ cwd: tmpRoot, filterId: 'does-not-exist' })
    expect(result.errors).toBe(1)
    expect(result.results[0].status).toBe('error')
    expect(result.results[0].detail).toContain('concept not found')
  })
})

// ─── #36 static enforcement kinds ──────────────────────────────────────────────

/** Repo with explicit participants + on-disk files. participants: [path, role][] */
function makeRepoWith(
  checkBlock: string,
  participants: [string, string][],
  files: Record<string, string>,
): string {
  const root = mkdtempSync(join(tmpdir(), 'koncept-checker-'))
  const conceptsDir = join(root, '.koncept', 'concepts')
  mkdirSync(conceptsDir, { recursive: true })
  const partYaml = participants
    .map(([f, r]) => `  - file: ${f}\n    role: ${r}\n    purpose: p`)
    .join('\n')
  const yaml = `
id: test-concept
name: Test Concept
type: behavioral-invariant
description: desc
source_of_truth:
  file: ${participants[0]?.[0] ?? 'src/x.ts'}
participants:
${partYaml}
invariants:
  - id: test-inv
    description: test invariant
    severity: high
    check:
${checkBlock}
created: "2026-01-01"
last_updated: "2026-01-01"
`.trim()
  writeFileSync(join(conceptsDir, 'test-concept.yaml'), yaml)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return root
}

describe('kind: implication (per-file)', () => {
  const CHECK = `      kind: implication\n      if: "BankingCacheService"\n      then: "CacheInvalidationService"`

  it('file matches `if` but not `then` → fail with file in detail', async () => {
    tmpRoot = makeRepoWith(CHECK, [['src/svc.py', 'writer']], {
      'src/svc.py': 'uses BankingCacheService only',
    })
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.failed).toBe(1)
    expect(result.results[0].kind).toBe('implication')
    expect(result.results[0].detail).toContain('src/svc.py')
  })

  it('file does not match `if` → not an offender (pass)', async () => {
    tmpRoot = makeRepoWith(CHECK, [['src/svc.py', 'writer']], {
      'src/svc.py': 'unrelated content',
    })
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
  })

  it('file matches both `if` and `then` → pass', async () => {
    tmpRoot = makeRepoWith(CHECK, [['src/svc.py', 'writer']], {
      'src/svc.py': 'BankingCacheService + CacheInvalidationService',
    })
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
  })

  it('lists every offender across files', async () => {
    tmpRoot = makeRepoWith(
      CHECK,
      [
        ['src/a.py', 'writer'],
        ['src/b.py', 'writer'],
      ],
      {
        'src/a.py': 'BankingCacheService alone',
        'src/b.py': 'BankingCacheService alone too',
      },
    )
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.failed).toBe(1)
    expect(result.results[0].detail).toContain('src/a.py')
    expect(result.results[0].detail).toContain('src/b.py')
  })
})

describe('kind: symbol_present (per-file AND)', () => {
  const CHECK = `      kind: symbol_present\n      pattern: "Foo"`

  it('every selected file has the pattern → pass', async () => {
    tmpRoot = makeRepoWith(
      CHECK,
      [
        ['src/a.ts', 'writer'],
        ['src/b.ts', 'writer'],
      ],
      { 'src/a.ts': 'class Foo {}', 'src/b.ts': 'extends Foo' },
    )
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
  })

  it('one file lacks the pattern → fail (per-file AND, not any)', async () => {
    tmpRoot = makeRepoWith(
      CHECK,
      [
        ['src/a.ts', 'writer'],
        ['src/b.ts', 'writer'],
      ],
      { 'src/a.ts': 'class Foo {}', 'src/b.ts': 'no symbol here' },
    )
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.failed).toBe(1)
    expect(result.results[0].detail).toContain('src/b.ts')
  })
})

describe('kind: forbidden', () => {
  const CHECK = `      kind: forbidden\n      pattern: "console.log"`

  it('no file contains the pattern → pass', async () => {
    tmpRoot = makeRepoWith(CHECK, [['src/a.ts', 'writer']], { 'src/a.ts': 'clean()' })
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
  })

  it('a file contains the pattern → fail', async () => {
    tmpRoot = makeRepoWith(CHECK, [['src/a.ts', 'writer']], { 'src/a.ts': 'console.log(1)' })
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.failed).toBe(1)
    expect(result.results[0].detail).toContain('src/a.ts')
  })
})

describe('over selector', () => {
  it('over.role filters participants — violation in a non-selected role is ignored', async () => {
    const CHECK = `      kind: forbidden\n      over:\n        role: writer\n      pattern: "BAD"`
    tmpRoot = makeRepoWith(
      CHECK,
      [
        ['src/w.ts', 'writer'],
        ['src/r.ts', 'reader'],
      ],
      { 'src/w.ts': 'clean', 'src/r.ts': 'BAD lives here but is a reader' },
    )
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.passed).toBe(1)
  })

  it('over.role matching nothing → error (empty selection)', async () => {
    const CHECK = `      kind: symbol_present\n      over:\n        role: tester\n      pattern: "x"`
    tmpRoot = makeRepoWith(CHECK, [['src/w.ts', 'writer']], { 'src/w.ts': 'x' })
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.errors).toBe(1)
    expect(result.results[0].detail).toContain('no participants match')
  })

  it('missing participant file → error', async () => {
    const CHECK = `      kind: symbol_present\n      pattern: "x"`
    tmpRoot = makeRepoWith(CHECK, [['src/gone.ts', 'writer']], {})
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.errors).toBe(1)
    expect(result.results[0].detail).toContain('file not found')
  })

  it('invalid regex → error', async () => {
    const CHECK = `      kind: symbol_present\n      pattern: "[invalid"`
    tmpRoot = makeRepoWith(CHECK, [['src/a.ts', 'writer']], { 'src/a.ts': 'x' })
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.errors).toBe(1)
    expect(result.results[0].detail).toContain('invalid regex')
  })
})

describe('staticOnly mode', () => {
  it('skips kind: command instead of executing it', async () => {
    tmpRoot = makeRepo(
      BASE_YAML(`      kind: command\n      cmd: "node -e \\"process.exit(1)\\""`),
    )
    const result = await runChecks({ cwd: tmpRoot, staticOnly: true })
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.results[0].status).toBe('skip')
  })

  it('still evaluates static kinds under staticOnly', async () => {
    const CHECK = `      kind: forbidden\n      pattern: "BAD"`
    tmpRoot = makeRepoWith(CHECK, [['src/a.ts', 'writer']], { 'src/a.ts': 'BAD' })
    const result = await runChecks({ cwd: tmpRoot, staticOnly: true })
    expect(result.failed).toBe(1)
  })
})

describe('result.description', () => {
  it('populates the invariant description on each result (remediation hint)', async () => {
    tmpRoot = makeRepo(BASE_YAML('      kind: none'))
    const result = await runChecks({ cwd: tmpRoot })
    expect(result.results[0].description).toBe('test invariant')
  })
})

// ─── tally ────────────────────────────────────────────────────────────────────

describe('tally', () => {
  it('aggregates counters correctly across multiple invariants', async () => {
    // Concept with none + passing grep
    const yaml = `
id: multi-inv
name: Multi
type: behavioral-invariant
description: desc
source_of_truth:
  file: src/x.ts
invariants:
  - id: inv-none
    description: none
    severity: low
    check:
      kind: none
  - id: inv-grep-pass
    description: grep pass
    severity: low
    check:
      kind: grep
      pattern: "hello"
      in:
        - src/x.ts
created: "2026-01-01"
last_updated: "2026-01-01"
`.trim()
    tmpRoot = mkdtempSync(join(tmpdir(), 'koncept-checker-'))
    const conceptsDir = join(tmpRoot, '.koncept', 'concepts')
    mkdirSync(conceptsDir, { recursive: true })
    writeFileSync(join(conceptsDir, 'multi-inv.yaml'), yaml)
    mkdirSync(join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(join(tmpRoot, 'src', 'x.ts'), 'hello world')

    const result = await runChecks({ cwd: tmpRoot })
    expect(result.skipped).toBe(1)
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.errors).toBe(0)
  })
})
