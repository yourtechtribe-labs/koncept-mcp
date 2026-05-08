# Security policy

## Supported versions

koncepto is pre-alpha. The latest published `0.1.0-alpha.x` is the only version that receives security fixes. Older alphas are not patched — upgrade to the latest `@alpha` to get fixes.

| Version | Supported |
|---|---|
| `0.1.0-alpha.3` (current `alpha`) | ✅ |
| Older alphas | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's Private Vulnerability Reporting:

→ https://github.com/yourtechtribe-labs/koncept-mcp/security/advisories/new

This sends an encrypted advisory only the maintainers can see. It also gives you a private fork to propose a fix if you have one.

If for some reason you can't use GitHub's flow, email `albert.gil@yourtechtribe.com` with `[koncepto security]` in the subject.

## What to expect

This is a single-maintainer pre-alpha project. Honest expectations:

- **Acknowledgement**: within 7 calendar days of your report.
- **Triage** (severity assessment + initial response): within 14 days.
- **Patch**: no SLA at pre-alpha. Best-effort, depends on severity and complexity. We aim for "fixed before the next public release" for high/critical issues; lower-severity issues may be batched.
- **Disclosure**: coordinated. We'll agree on a timeline before publishing the fix and the advisory.

We won't ghost you. If we can't reproduce or fix it, we'll say so explicitly.

## Scope

**In scope:**

- The `@yourtechtribe-labs/koncept-core`, `koncept-mcp-server`, and `koncept-cli` packages on npm.
- The MCP server's tool surface (input validation, tool isolation, read-only contract).
- The YAML parser and indexer (path traversal in participant file resolution, prototype pollution, ReDoS in cross-ref resolution).

**Out of scope:**

- Vulnerabilities in third-party dependencies — please report upstream. We'll bump versions promptly via Dependabot.
- Self-XSS or social engineering against project maintainers.
- Spam / SEO / typosquatting reports — not security issues.

## Provenance and supply chain

All published packages from `0.1.0-alpha.2` onward carry a sigstore provenance attestation linking the tarball to the GitHub Actions workflow run that built it. Verify with:

```bash
npm audit signatures
```

or check the "Provenance" badge on each package's npmjs.com page.
