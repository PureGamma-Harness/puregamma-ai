# UI foundation: implementation prompt and review

## Repository context

Baseline: `48fe315`. This slice owns the shared navigation, UI primitives,
appearance controls, and the localized dashboard. PureGamma already has a
Glass/Classic presentation system, light/dark tokens, en/zh content, a real chat
entry point, evidence-backed reports, and capability-gated trading. Preserve
those contracts instead of introducing a second design system.

Observed issues:

- `components/nav.tsx` keeps the closed mobile drawer in the tab order with
  `aria-modal=true`; a transform only moves it offscreen. Opening it does not
  contain focus, isolate the background, lock scrolling, or restore focus.
- The shell has no skip-navigation link or stable main-content focus target. Desktop active
  links have visual state but no `aria-current`.
- `components/ui.tsx` uses a hard-coded white primary button even though the
  theme already defines inverse action colors. The focus outline in
  `app/globals.css` only applies to Glass, leaving Classic inconsistent.
- Dashboard evidence titles are plain text without a route to the existing
  report-reading workflow. Major workspaces lack a compact, contextual route
  overview beneath the research command surface.

## Execution prompt

Act as the product designer and frontend engineer for an evidence-first agent
research SaaS. Improve the existing product, using native browser semantics,
progressive enhancement, visible interaction states, and responsive information
hierarchy. Make it clear where to ask a question, inspect research evidence, and
review portfolio context. Evidence is supporting material, not a trading
authorization; never invent a capability, balance, source, or success state.

Use native modal dialog behavior for the mobile navigation: closed content is
not interactive, document focus stays inside while open (normal browser chrome remains reachable), Escape/backdrop/close work,
background content is inert, scroll is restored, and the trigger regains focus.
Resize into desktop navigation must release the modal. Supply a skip link and
current-page semantics. Retain every existing navigation destination and
appearance/language control.

Use existing typography/color tokens and improve shared controls in both
themes and appearances. Add a concise dashboard workflow strip and make report
trail entries navigate to the existing report list with an encoded `report` query
selection; the research slice resolves that ID only among the current user’s
server-provided reports, without adding a report-detail API. Preserve server-rendered data freshness and
empty/unavailable behavior.

## Acceptance and verification

- Real Chromium at 390px and desktop: no page overflow; closed drawer absent
  from accessible navigation; modal focus containment, Escape, backdrop,
  focus return, body-scroll cleanup, and desktop-resize cleanup work.
- Keyboard users can skip directly to the main content; current navigation is
  announced. Touch actions have comfortable targets and focus is visible in
  Classic and Glass, light and dark.
- Dashboard workflow links and evidence trail use existing localized routes;
  no fake account or research data is introduced.
- Run TypeScript, lint, a production build, and a focused offline Playwright
  regression suite. Test local synthetic data only; no outside providers,
  production deployment, live trading, Stripe, or public tunnel.
- Preserve `pnpm-lock.yaml`, dependency versions, shared API contracts,
  translations, and other agents' console ownership.

## Self-review and evidence

Implemented native mobile modality with Escape/backdrop/route/desktop dismissal,
scroll restoration, an expanded-state trigger and automatic focus restoration.
A skip link and stable main target remove repeated navigation for keyboard users.
The rail now announces the active page. Appearance controls retain all font
settings in the mobile drawer, wrap naturally in the rail and share their live
state through `useSyncExternalStore`, including when storage is blocked. Explicit
Glass preferences now override a Classic build default consistently in both the
reader and the actual pre-paint script.

Shared primary buttons use the theme's inverse action tokens, shared form
controls have comfortable height and visible focus in either appearance. The
dashboard has three real localized research/report/portfolio workflows, encoded
report-selection links and a waiting state for an empty market snapshot.

Browser review exposed a further real failure: Chrono wrappers initially used
hydration-default motion/style state and hid server-rendered content even for
Classic/reduced-motion users. Synchronous document/device checks now precede
hiding, and `revertOnUpdate` cleans old GSAP state when preferences change.
The first validation screenshots revealed a clipped rail font-size action and
wrapped Chinese language label; wrapping the control groups fixes both.

The mobile focus regression checks native behavior rather than trapping the
browser chrome. A 35-Tab diagnostic showed one BODY sentinel with
`document.hasFocus() === false`, followed by focus returning inside the dialog;
no background application control received focus. The committed regression also
attempts to focus the inert background menu directly and checks it is refused.

Validation commands (from `apps/web`, with pnpm10.28.2):

```sh
node --test tests/appearance-preferences.test.cjs
pnpm typecheck
pnpm lint
NEXT_PUBLIC_API_URL=/api NEXT_TELEMETRY_DISABLED=1 pnpm build
# Copy public and .next-build/static into the standalone output, as in deployment.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm exec playwright test --config playwright.foundation.config.ts
```

The nine committed Node tests execute the actual TypeScript reader and the actual
RootLayout JSX-produced inline script across eight default/preference combinations
plus blocked storage. They passed on Node22 and24. The prior source fails the
Classic-default/explicit-Glass contract. Browser regression source and local
synthetic backend are committed; browser evidence and final counts are appended
below after the final production artifact completes verification.

### Primary-method references

Reviewed on 2026-11-08:

- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore):
  stable external/browser state subscriptions with an explicit server snapshot.
- [Native dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog):
  `showModal()` supplies top-layer modality and makes background UI inert.
- [GSAP React integration](https://gsap.com/resources/React/): context cleanup and
  `revertOnUpdate` for dependency-driven animation changes.

HTTP200 reference excerpts are retained in
`/workspace/scratch/round6-ui-foundation-primary-references.json`. These browser
and React techniques improve the actual Agent SaaS navigation and evidence
handoff; retrieval/model logic remains the separate RAG slice's responsibility.

### Frozen-candidate result

The final production build completed with **143 pages** and no build, type or
lint errors (existing unrelated lint warnings remain). All nine production files
match the hashes frozen at final-build start. The final ten-case Chromium suite
passes **10/10**. Its byte-identical final regression source run against the
pre-upgrade standalone produced **8 failed / 2 passed**; the two motion controls
can pass on the original source depending on hydration timing, so they are not
claimed as stable old-code red proofs. Earlier exploratory counts are superseded
by the final baseline. The nine actual-source Node contracts pass on both
**Node22.23.4 and Node24.22.1**. The frontend production artifact was built on
Node24; the final integrated Node22 build matrix is owned by root/CI.

Paired real-browser screenshots use desktop1440/dark/Classic/en and
mobile390/light/Glass/zh with a synthetic loopback backend. Both have zero page
errors and no horizontal overflow. The original mobile closed drawer appears as
an accessible dialog, opening leaves focus outside and body scrolling unlocked;
the candidate has no closed accessible dialog, places focus inside and locks
scrolling. Empty snapshot presence changes from LIVE/实时 to WAITING/等待数据.
Workflow links go from0 to3 and report links retain the exact encoded selection.
The final rail screenshot confirms horizontal language text and all appearance
controls fully contained. Analytics requests are explicitly aborted; no real
provider, transaction, message or public tunnel is used. Every owned server,
browser context and fixture listener is torn down.

Evidence lives under `/workspace/scratch/round6-ui-foundation-*`: final build and
browser logs, `before-final.log`, before/after browser JSON, viewport/full-page
screenshots, source hashes, primary-reference excerpts and Node22/24 logs.
`before-final-results` preserves the original failure traces. Reports selection
requires the coordinated research slice; unknown portfolio state remains the
operations slice's separate responsibility. No shared API, dependency, release
feature gate or LIVE flag changed in this slice.
