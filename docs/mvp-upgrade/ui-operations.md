# Operations MVP implementation brief

## Repository evidence and execution prompt

Act as the product engineer for PureGamma's bilingual operations workspace. Work
from the current Next.js 15 / React 19 application and its authenticated API
contracts, rather than inventing financial data or enabled integrations. The
Agent's suggestions, RAG evidence and Harness research are context for decisions;
they must never imply permission to submit orders or change credentials.

The existing `GatewayConsole` executes rotate/revoke immediately, reports clipboard
success without handling rejection, and renders fallback wallet zeroes as real
balances. `PortfolioConsole` starts with an empty account snapshot, the snapshot type and view ignore the shared API failure marker, disconnect is immediate, and failed sync reads can replace the last snapshot with an empty fallback.
`syncAll` also lacks a defensive `finally` for unexpected errors. The wallet-address field has no
accessible label. These are the selected MVP blockers.

Implement a coherent read → connect/manage → review → confirm → feedback flow:

1. Distinguish initial loading, genuine zero assets, unavailability, and retained
   stale data. Do not reinterpret a provider/API error as an empty portfolio.
2. Use the browser's native modal dialog for destructive credential/account
   changes: a named target, consequences, initially focused safe action, Escape,
   focus return, and no network mutation until explicit confirmation.
3. Provide visible bilingual labels, recoverable errors and live feedback. Keep
   secrets only in existing component memory; an unavailable clipboard must not
   falsely claim success or cause an unhandled rejection.
4. Validate top-up amounts against server-provided bounds and a two-decimal USD
   representation before requesting checkout. Never call Stripe during tests.
5. Preserve all financial freshness, ownership, provider configuration and LIVE
   gates. Keep real zero-valued snapshots distinct from missing values.
6. Make actions and account/key information usable at 390px and by keyboard.

Modern browser top-layer dialogs and progressive form validation are deliberately
preferred here over adding a dialog/state-management dependency. RAG or a model
does not participate in these deterministic financial and credential controls.

## Ownership and route audit

| Surface | Existing contract / audit outcome | This change |
| --- | --- | --- |
| `/portfolio` | Read-only connections, aggregated NAV, separate server trading NAV, stale banners | Loading/unavailable/retry, validated public address, safe disconnect, operation feedback |
| `/gateway` | Server wallet, named API keys, one-time secret, verified top-ups | Keys before analytics, compact mobile metrics, honest unavailable values, bounded top-up form, named key creation, rotate/revoke confirmation, copy recovery and accurate filters |
| `/dashboard` financial/activity summaries | Shared portfolio payload and Agent history reads | Loading/unavailable distinct from empty/zero, preserve negative NAV, recoverable Agent activity read failure |
| `/billing/{success,cancel}` | Return URLs alone are not verified payment or subscription cancellation | Honest pending-payment and checkout-only cancellation copy |
| `/billing`, `/pricing` | SSR subscription/budget/rewards unavailable states; checkout remains backend-authorized | Source reviewed; no payment/gating change |
| `/trading/live/*` | Existing preview/token/second confirmation, static disabled gates, explicit errors | Source reviewed; LIVE gates and order flows unchanged |
| `/trading/{runtime,paper,positions,risk}`, `/strategies/*` | Runtime previews and confirmation; PAPER/SHADOW boundary | Source reviewed; no execution-policy change |
| `/account` | Session, password and iMessage binding | Source reviewed; root coordinates auth work |
| `/daily-push` | Existing preference/verification and delivery ledger | Source reviewed; provider send behavior unchanged |
| `/data-sources`, `/integrations` | Configuration/license/entitlement and freshness states | Source reviewed; no license or provider activation change |
| `/admin/*` | Admin gate and backend authorization; data/pricing controls | Source reviewed; no privilege change |
| `/backtest`, `/secretary` | Domain consoles and capability/provider contracts | Source reviewed; research and provider behavior unchanged |

The matrix is a source audit, not a claim that every row has browser or live
provider coverage. Focused browser cases cover the two changed operational flows.

## Acceptance and validation

- A failed portfolio read shows unavailability and retry, never a connected zero
  balance. A successful connected zero NAV remains `$0.00`.
- Disconnect/revoke/rotate open a named, keyboard-operable modal and perform no
  mutation before confirmation. Escape leaves data unchanged and returns focus.
- A failed confirmed action remains recoverable; pending operations prevent
  duplicate submissions and eventually release their busy state.
- Invalid public addresses and out-of-range / over-precision USD amounts do not
  reach the mutation API. All inputs have accessible names.
- Gateway unavailability shows unknown financial values, disables mutations and
  provides a reload path. Clipboard denial retains the displayed one-time key.
- Real Chromium checks desktop and 390px, English and Chinese labels, keyboard
  modal behavior, errors/retry and page overflow. All APIs/providers are synthetic
  loopback fixtures; no real orders, payment, notification or tunnel is created.
- Run TypeScript, lint, existing runtime/guard tests and independent review.

## Review record

Implementation and exact validation results will be appended after the frozen
candidate has been exercised. The native-dialog boundary requires a modern
browser; the supported Chromium test runtime provides it. Provider integration,
production deployment and financial authorization are unchanged.


## Implementation, self-review and evidence

The operational workspace now gives API keys priority over funding and analytics,
uses compact mobile metrics, and exposes named actions with 44px primary targets.
One-time secrets stay in component memory, can be selected manually if clipboard
access fails, and must be acknowledged before a new key can replace them.
Credential rotation/revocation and portfolio disconnection require a named native
modal confirmation. The dialog uses native top-layer/inert behavior, a safe first
focus, an explicit two-button Tab loop, Escape while idle, focus return and body
scroll restoration. Pending operations disable duplicate actions; errors remain
recoverable without claiming an unconfirmed backend result succeeded.

Portfolio loading and failed reads are distinct from an unconnected account. A
failed refresh retains the last loaded snapshot, marks it unavailable/stale and
offers retry. Genuine connected zero balances remain zero. Dashboard summaries
also preserve genuine negative NAV and show unknown values as a dash. Agent
activity has independent loading/error/retry rather than treating failed reads as
an empty history. All freshness, authorization and LIVE boundaries remain intact.
Only the shared `PortfolioSnapshot` optional flag and its own fallback are changed
in the API helper; root coordinates all other helper edits.

Gateway usage queries now use the just-selected model/key rather than the previous
React state, and a generation guard rejects late responses. Empty filtered results
retain the selected/previously observed option identities without inventing usage
rows or values. Invalid date ranges and USD/address inputs expose local errors
without sending a mutation. Amount validation uses integer cents and the actual
server-provided bounds. Billing return-page copy no longer declares an unverified
payment received or implies that cancelling checkout cancels a subscription.

A real mobile regression was caught during implementation: an absolutely positioned
`sr-only` actions header escaped the unpositioned horizontal table scroll region,
expanding a 390px mobile document to543px and confusing pointer hit coordinates in
a top-layer dialog. A visible Actions column header and a positioned scroll region
restore390px at scale1. The final browser test asserts against the configured
viewport, rather than comparing two already-expanded viewport measurements. No
forced click or relaxed hit-target assertion is used.

Validation on Node24.22.1, pnpm10.28.2 and local Chromium:

- The exact final expanded spec and config were copied into a detached original
  `48fe315` worktree. Both selected original-state browser cases fail: unavailable
  Gateway and unavailable Portfolio. Log: `round6-operations-baseline-final.log`.
- The first frozen production cohort passes **22/22 real browser cases** across
  desktop/light and390px mobile/dark: confirmation/Tab/Escape/focus return, mutation
  failure/retry, unavailable balances and disabled actions, amount validation,
  denied clipboard, true zero portfolio/retry, disconnect, invalid public address,
  actual selected filters, honest bilingual checkout pages, failed-sync recovery,
  and Dashboard unavailable/zero/negative NAV with Agent activity error/retry.
  Every case checks zero page errors; all nonlocal browser requests are blocked.
  Log: `round6-operations-browser-final-frozen.log`; frozen hashes:
  `round6-operations-source-freeze.json`.
- Self-review then found the empty-result option-identity edge case. Only
  `usage-panel.tsx` and the existing filter test changed. Its desktop and mobile
  cases were rerun **2/2 passed**, explicitly returning empty option metadata and
  waiting for the new response before asserting the selection. All other frozen
  files are byte-identical. Log: `round6-operations-filter-final.log`; final hashes:
  `round6-operations-source-final.json`. Root owns the complete final combined CI.
- Existing runtime security/offline-fetch tests pass **7/7**. Final TypeScript and
  lint are run after dev-server teardown; a preliminary check that raced Next's
  generated-type cleanup was discarded. Existing unrelated image/PM-chart lint
  warnings remain; these changed components introduce no warning.
- Early exploratory mobile and screenshot runs are superseded by the bounded
  viewport checks and the frozen evidence above. Optional visual captures use
  viewport/`scale:css`, not unbounded full-page rasterization, and contain no
  production credentials.

Reproduce from `apps/web` after the repository's frozen dependency install:

```sh
pnpm exec playwright test --config playwright.operations.config.ts
pnpm exec tsc --noEmit
pnpm lint
node --test tests/next-runtime-security.test.cjs tests/offline-fetch-guard.test.cjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using a system Chromium. The
application/HTTP fixtures bind loopback only and stop in teardown. Default port is
3213 (`PG_OPERATIONS_PORT` can change it). `PG_OPERATIONS_CAPTURE=1` attaches
bounded screenshots for the key/portfolio cases through Playwright's own artifact
paths. `PG_OPERATIONS_STANDALONE=1` uses the prepared `.next-build/standalone`
server; that test build must compile `NEXT_PUBLIC_API_URL=/api` and
`NEXT_PUBLIC_INITIAL_LAUNCH_MODE=false`, with public/static assets copied as in the
existing standalone smoke workflow. This is test configuration, not a change to
production feature defaults.

Independent source review by the product-review agent found no blocker in the
initial12-file freeze; the final two-file option edge-case delta is explicitly
handed off for review. Root performs combined production-build/CI verification
before merge. Real provider, brokerage, Stripe, notification, production deployment
and native mobile rendering are not claimed by these local Web tests.
