# Site dependency hardening

## Repository evidence and execution prompt

The commercial preview under `apps/site` is the existing vinext/Vite application,
with local Cloudflare Worker rendering and optional Drizzle schema tooling. Its
tracked npm lock exposes three moderate development-tool advisories through
`@esbuild-kit/core-utils`, `satori` and TypeScript-ESLint. Production-only audit
is clean; development tools can still process source, fonts and configuration.

Act as the site's dependency maintainer. Preserve direct package versions,
application content, Worker compatibility policy, production gates and deployment
configuration. Use consumer-scoped overrides only where the declared range
cannot select a patched release. Validate the actual consumer APIs and module
loading, then run the existing type, lint, CSS and local rendered-HTML checks
under Node 22 and Node 24. Keep Cloudflare network fetch disabled and do not
deploy or generate migrations in the real application directory. Audit the
resulting frozen lock, and require independent source/lock review before merge.

## Changes and acceptance

| Consumer | Vulnerable dependency | Scoped replacement |
| --- | --- | --- |
| `@esbuild-kit/core-utils` | esbuild 0.18.20, GHSA-67mh-4wv8-2f99 | 0.25.12, already used by other site tooling |
| `satori` | fflate 0.7.3, GHSA-px8p-9vwx-vf98 | 0.7.5, patched on the same release line |
| `@typescript-eslint/typescript-estree` | minimatch 10.2.5, GHSA-g3hv-75wg-m249 | 11.0.5, retaining other minimatch consumers |

The baseline full audit reports 16 moderate dependency/meta entries representing
these three advisories; production audit reports zero. A meta entry is not a
separate vulnerability. Ordinary direct-package updates cannot select patched
versions through the affected declared ranges. Broad audit-fix downgrades are
not part of this change.

The generated lock also corrects development-only flags for 29 optional Sharp
package entries reachable through production Next. Their versions, download
locations and integrity hashes are unchanged. Other minimatch consumers retain
their existing versions. Manifest CRLF and lockfile LF line endings are retained.

Acceptance requires actual TypeScript transform/schema-tool compatibility,
font/OG decompression compatibility, TypeScript-ESLint glob behavior, the existing
site build and rendered Worker/CSS regressions, and a clean full/production audit.
GitHub's alert-detail API is unavailable to the current integration (403), so npm
audit evidence cannot establish that specific GitHub alert records are closed.

## Verification and independent review

The isolated checkout was installed with a fresh `npm ci` using Node 22.23.4 and
npm 10.9.9. Both runtime checks below use that same frozen dependency tree; fresh
installation in each runtime is also required by the hosted matrix.

| Local check | Node 22.23.4 | Node 24.22.1 |
| --- | --- | --- |
| TypeScript check | pass | pass |
| ESLint | pass | pass |
| vinext production build | pass | pass |
| Existing CSS/rendered Worker checks plus four consumer regressions | 18/18 | 18/18 |

Full and production-only npm audits both report zero vulnerabilities. The full
lock metadata covers 692 package entries, including other-platform optional
packages; that count does not mean all entries ship in production. A first lint
run rejected a test-local variable named `module`; renaming it to `loaded`
resolved the existing Next lint rule without changing or disabling the rule.

The consumer regressions execute the actual core-utils synchronous/asynchronous
transform and original ESM loader, generate SQL from an isolated TypeScript
schema, render compressed WOFF tables through Satori to SVG paths, and run
Next's TypeScript parser with allowed dotfile globs and rejected unmatched files.
No migration or application source is generated in the site itself.

The existing Node 22/24 `Site compatibility` workflow now also requires
`npm audit --audit-level=moderate` immediately after clean installation. Merge
acceptance requires both fresh hosted matrix jobs and an independent review of
the frozen source/lock, recorded in the implementation pull request's Checks
and review evidence. Local results do not substitute for those checks. The
implementation owner does not approve or merge its own patch.
