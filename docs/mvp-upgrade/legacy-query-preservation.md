# Legacy locale redirects: execution prompt and acceptance

Follow-up base: `40d5ca32811b948eaff6e2f9bae5938b7f92a5a2`. The integrated route-quality agent's unchanged all-alias HTTP test and68-request probe found that `/account`, `/api`, `/chat`, `/gateway` and `/secretary` lose query values in both locales. The other29 entries, including the root redirect, preserve them. The repository has33 legacy page aliases plus the root redirect.

## Execution prompt

Act as the engineer for existing Agent SaaS deep links and locale transitions. Preserve the caller's question, report/filter context and auth callback values through legacy redirects without interpreting query text as navigation authority. Fix the actual route contract with the smallest compatible change; do not add RAG, new dependencies or a routing framework.

The four ordinary missing aliases must enter the existing middleware locale redirect, which already clones the URL and preserves its search. Bare `/api` is an API-documentation page alias, while existing `/api/*` requests belong to API handlers. Keep the middleware's API bypass byte-identical. Pass the documentation page's actual Next searchParams to an optional backwards-compatible page redirect helper, serializing strings, repeated values and empty values with URLSearchParams. Static application-owned paths remain the only redirect destinations; values such as returnTo, URLs, ampersands and encoded delimiters are data.

Scope: `apps/web/i18n/routing.ts`, `app/legacy-redirect.ts`, `app/api/page.tsx`, dedicated tests and this documentation. Keep default initial-launch hiding, authentication requirements, safe returnTo validation, real API behavior and all provider capabilities unchanged. Do not modify the integration worktree, immutable build artifacts, route-quality agent's fixture or228-case assertions.

## Acceptance and independent review

- All33 legacy aliases plus `/` retain the selected English/Chinese locale and original query values; nested aliases continue to work.
- Preserve repeated keys, blank strings, Unicode, percent encoding and redirect-looking values without changing the local destination. Unauthenticated protected localized paths retain the original local path and query inside login returnTo.
- Actual `/api/*` handling and the existing `/api` middleware bypass remain unchanged; no API requests are converted into locale redirects. Initial-launch hidden routes still redirect to the localized dashboard and intentionally clear query exactly as before.
- Execute the real middleware/SSR alias modules in focused boundary tests, including real loopback HTTP requests for the complete alias inventory. Show the same tests fail on the old source and pass after the correction. Run the appropriate type/lint checks without an extra whole-project build.
- The route-quality agent independently reruns its original all-alias HTTP test and probe against root's newly built production artifact; the component-level tests do not substitute for that production result.

## Implementation and verification

Added the four ordinary missing paths to the existing locale-prefix list. Bare `/api` now supplies its actual Next searchParams to the backwards-compatible helper. The helper appends each repeated value and retains blank strings using URLSearchParams, ignores undefined optional fields, and keeps its application-owned destination separate from query values. The middleware and every actual API handler remain byte-identical.

`node --test tests/legacy-query-preservation.test.cjs` runs five focused tests against the real transpiled routing, middleware, page and redirect modules with real NextRequest/NextResponse/redirect behavior. The first test makes68 loopback HTTP requests covering all33 aliases plus root in both locales, with repeated keys, blanks, Unicode, percent/delimiter text and redirect-looking returnTo values. A page fallback is executed only when the real middleware permits it; the test does not duplicate redirect decisions. Remaining tests directly verify the API-documentation SSR page, single-argument helper compatibility, unchanged API-prefix bypass, auth returnTo and default launch hiding.

The exact final test first ran against40d5ca3 and produced3 passes/2 failures: ordinary `/account` dropped route_audit and the API documentation page dropped repeated values. Both Node24.22.1 andNode22.23.4 now pass5/5, including all68 requests. No Next server compilation, provider request or integration artifact change was required. Logs: `/workspace/scratch/round6-legacy-query-before.log`, `round6-legacy-query-final.log`, `round6-legacy-query-node22.log`. The independent route-quality agent retains the separate original production HTTP matrix; its final re-run is recorded by root after rebuilding the combined artifact.

Full web typecheck exits0, including a repeat with canonical tracked next-env.d.ts restored after Next lint generated declarations. Focused lint of the three production files exits0 with no warnings. Evidence: `round6-legacy-query-typecheck.log`, `round6-legacy-query-canonical-typecheck.log`, `round6-legacy-query-lint.log`. No middleware, API handler, manifest, lockfile or default feature gate is changed.
