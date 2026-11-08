# Whole-route browser quality contract

## Execution prompt

Act as the release-quality engineer for PureGamma's existing Next.js/React
research workspace. Read the actual App Router tree, middleware, route-access
policy and the route source audit before writing the test harness. Distinguish
page files, localized routes, aliases and capability-gated features. A source
inventory is not browser evidence and a rendered navigation shell is not a
working route.

Exercise every canonical page in English and Chinese on desktop and a 390px
viewport using the real production standalone server. Preserve all production
feature flags. Use explicit synthetic read-only fixtures for identity, an owned
conversation and an owned degraded research run. Other optional APIs must return
an explicit unavailable response; never fabricate balances, market prices,
successful trades, subscriptions, provider responses or notification delivery.
Reject writes and stop all non-local browser traffic. The existing preloaded
server fetch guard must also protect server-rendered API reads.

Use the App Router's real HTTP and hydration behavior, WAI accessibility
landmarks, and Playwright's web-first assertions. Keep route discovery data
driven and share the harness across routes rather than copying implementation
templates into tests. Report the exact failing path and offending overflow
elements so the original feature owner can fix the product.

## Acceptance and scope

- Discover every page from `apps/web/app`, strip route-group segments, and
  account separately for the baseline's 54 localized canonical pages, 33 legacy
  aliases, root locale redirect and two public legal pages.
- In the **full-product test build**, visit all 54 canonical routes in both
  locales and both viewports. Dynamic IDs are synthetic owned fixtures; missing
  IDs additionally exercise the explicit unavailable/not-found boundary.
- In the **default launch build**, hidden route prefixes must redirect to their
  localized dashboard without a query string. Those are gate checks, not a
  claim that the hidden feature is available.
- A successful route has an HTTP response below 500, remains on its intended
  local path, hydrates in the correct language, exposes substantive main
  content, avoids the generic route error boundary, and produces no uncaught
  browser errors. A visible scoped unavailable state may satisfy an optional
  feature's degraded-state contract.
- No page-level horizontal overflow at 390px. Bounded scrolling inside tables,
  code blocks and chart containers is allowed. Failures attach the overflowing
  elements and route metadata.
- Legacy redirects retain locale preference and query values. Public legal
  pages remain readable without a session.
- All API requests stay on an ephemeral loopback backend; non-GET requests fail
  the audit. Listeners and connections are closed in `finally`. Browser external
  requests are aborted before dispatch; blocked attempts are recorded separately
  from successful requests.
- A separate APIRequestContext request (no browser JavaScript) verifies that
  Options SSR forwards the synthetic session and reads both expected endpoints
  from this worker's loopback fixture. Browser-proxied reads are marked
  separately, preventing a client-only mock from masquerading as SSR coverage.

## Reproduction

From `apps/web`, use the repository's pnpm10.28.2 and install Playwright's browser
or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium. Build once
with `NEXT_PUBLIC_API_URL=/api`, prepare the standalone static/public assets as
the existing runtime-security workflow does, then run:

```sh
# Full-product source validation only; this does not change production defaults.
NEXT_PUBLIC_API_URL=/api NEXT_PUBLIC_INITIAL_LAUNCH_MODE=false corepack pnpm@10.28.2 build
mkdir -p .next-build/standalone/.next-build
cp -R public .next-build/standalone/
cp -R .next-build/static .next-build/standalone/.next-build/
PG_ROUTE_MODE=full corepack pnpm@10.28.2 exec playwright test --config playwright.routes.config.ts

# Rebuild without that public flag to verify the default launch boundary.
NEXT_PUBLIC_API_URL=/api corepack pnpm@10.28.2 build
cp -R public .next-build/standalone/
mkdir -p .next-build/standalone/.next-build
cp -R .next-build/static .next-build/standalone/.next-build/
PG_ROUTE_MODE=launch corepack pnpm@10.28.2 exec playwright test --config playwright.routes.config.ts
```

`PG_ROUTE_SERVER_ROOT` may point at another checkout's already-frozen
`apps/web` directory. It changes only which local standalone artifact is started;
route discovery and tests still come from the runner checkout. `PG_ROUTE_PORT`
defaults to3215. The mode describes the expected **build-time** gate state: it
cannot override an already inlined public environment variable at runtime.

This suite checks route health and unavailable-state usability. It does not
replace workflow-specific tests for mutations, keyboard dialogs, research
streaming, financial calculations, real model quality, licensing or external
provider setup. No deployment or provider enablement is implied.

## Validation record

Implementation and discovery checks are performed before running browsers.
Actual final-artifact results and independently reproduced failures are recorded
after the root integration build is available. No all-route pass is claimed
until that run completes.

The clean pnpm10.28.2 installation, web typecheck and lint pass; lint reports
only existing product warnings. TypeScript semantic compilation of the route
configuration, external fixture and spec also reports zero diagnostics. Test
discovery lists228 cases in each mode: full mode has216 canonical browser visits;
launch mode has148 canonical browser visits and68 hidden-gate HTTP checks.
Remaining cases cover inventory, aliases, owned missing-ID boundaries, SSR
session forwarding and public legal pages. Discovery does not start a server.

Self-review checked that HTTP redirects and browser rendering remain separate,
the mode is never written to production feature flags, unknown APIs return501
rather than plausible financial rows, mutation requests return405 and fail the
route audit, source discovery includes route groups correctly, global document
width is asserted even when no main child explains the overflow, and every
backend listener/connection closes in `finally`. The browser executable is
selected only when explicitly configured; CI may use Playwright's downloaded
browser.

### First frozen production-artifact run

The complete full-mode matrix against integrated commit
`ba4bc77f08eeba137078707be05646a06059570d` completed228 cases:
204 passed,24 failed,0 skipped,0 flaky. All failures were individually classified:
legacy query loss; structured admin errors rendered as React children; nested
main landmarks in API/JEV; an uncaught Daily Push server read; decorative
Secretary desktop overflow; unbroken Backtest error text on mobile; and a
test-contract bias on the Chinese documentation shell. Product fixes belong to
their feature owners and require another frozen-artifact run.

The documentation shell's23 Chinese characters express the same heading,
description and recovery action as its longer English copy. Instead of reducing
the general content threshold, `/docs` now has a stronger dedicated contract:
the visible localized heading, correctly localized GitBook destination, named
external link with `_blank` and both safe-rel tokens, and a visible iframe with
the proper localized title and URL. Unique main, generic-boundary rejection,
busy-state, uncaught-error and viewport checks remain unchanged. The blocked
third-party document's body is not claimed to be available.

Initial evidence is archived under `/workspace/scratch/round6-route-full-initial*`.
The revised semantic contract and production repairs are not claimed green until
the subsequent integrated browser run completes.
