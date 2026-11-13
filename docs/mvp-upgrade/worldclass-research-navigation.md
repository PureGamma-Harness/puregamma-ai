# Workspace navigation boundaries

## Problem and execution contract

A completed server response can leave a native workspace navigation displaying
its previous page. Diagnose that behavior against frozen production artifacts
and give the existing shared main boundary the identity of the actual route.
Preserve native navigation, the permanent main landmark, phase-aware fallback,
no-JavaScript content, providers, active Agent streams and all application
handlers. Do not substitute reloads, disable prefetch, extend timeouts or add
retries. Root owns artifact builds and behavior acceptance.

## Implemented boundary design

`AppShell` retains its existing main element and inner Suspense. That Suspense
now has `JSON.stringify([locale, ...useSelectedLayoutSegments()])` as its key.
The public Next hook follows the actual selected layout tree, so a genuinely
different route receives a fresh boundary identity. The unchanged fallback
continues to preserve server children in static documents and render existing
localized loading feedback during client retries.

The key deliberately does not follow the address bar's pathname. Agent's first
message creates a conversation and uses native `history.replaceState` to rename
its URL before permission and streaming finish. Next updates `usePathname` for
that operation but retains its internal layout tree. A pathname-based key would
remount Agent, whose cleanup aborts that active transaction. The layout-segment
identity preserves this URL-only rename, as well as query-only report selection
and same-path Portfolio URL cleanup. Locale remains part of the identity.

The earlier conventional `research/[runId]/loading.tsx` entry remains as a
route-local loading seed and boundary using the existing `WorkspaceLoading`.
It supplies focused feedback for that detail route; it is not the general
solution for every lazy destination. No locale-wide loading entry was added.

## Evidence from actual failures

### Research detail and the initial route-local correction

Frozen candidate 3 (`VP4OqBxkTE4WKX2yOborP`) intermittently stayed on the list
after clicking the real Research run Link. The failed workflow trace contains
a complete 200 RSC response, matching build and run IDs, completed metadata and
a successful detail chunk, while no detail effects mount.

An independent GET-only port 3216 probe retained the native Link and original
10-second URL assertion. Two seven-attempt diagnostic batches each reproduced
one failure. Post-timeout inspection found all five Webpack chunk promises
resolved. A final first-failure probe confirmed that the shared main's alternate
Suspense retained a fulfilled wakeable whose value was strictly identical to
module 6508's `ResearchRunDetail` export. Root pending and suspended lanes were
equal, with zero pinged lanes and no scheduled callback. The external App Router
action queue had completed the target state while the committed URL remained
on the list.

Adding the Research segment loading entry subsequently passed real Research
navigation checks, but the later Dashboard failure below demonstrated that a
route-local correction did not resolve the shared boundary's general identity.

### Hosted onboarding save to Dashboard counterexample

PR61 Web job 132069354549 in run 43478730975 failed the unchanged desktop
save-failure/retry case. Its intended first save returns 503; the second save
returns complete 200 `{ok:true,user:...}` data. The fresh Dashboard navigation
RSC response completes in about 35ms with 16,304 decoded bytes, the final page
record and metadata. Every referenced client dependency returns 200. The
15-second URL expectation still observes `/en/onboarding/channels`.

A separate local candidate 5 probe retained that original fixture and
15-second expectation: nine attempts passed and one reproduced the failure.
The save-complete local flag is true, the external action queue has Dashboard
with no pending action, and the shared alternate boundary again retains a
fulfilled wakeable while the committed router remains on the old page. These
are diagnostic samples, not substitutes for the original suite or hosted CI.

Evidence remains outside the repository:

- `/workspace/scratch/worldclass-rsc-foundation-probe/artifacts-v3/probe-native-research-navigation-fiber-diagnostic/runtime.json`
- `/workspace/scratch/worldclass-pr61-ci-failure/unpacked/auth-onboarding/auth-onboarding-save-failu-a537a-ims-an-authentication-error-desktop/trace.zip`
- `/workspace/scratch/worldclass-auth-fiber-probe/artifacts/auth-onboarding-save-failu-a537a-ims-an-authentication-error-repeat9/fiber-runtime.json`

The fulfilled wakeables and uncommitted transitions are observed facts. They do
not establish a unique vendor-internal React / Next cause. Runtime hooks and
Webpack inspection were scratch-only; product bundles and RSC responses were
not rewritten.

## Verification

Scoped ESLint, the application TypeScript check, whitespace checking and the
coordinator's production build pass. Frozen candidate 6 is
`_wPIb-jZhMuN5vgU83CPH`; the shared-boundary change is its only production-file
difference from candidate 5. Its 100 authentication/navigation/research/operation
checks and 20 product-experience checks pass with the original zero-retry
budgets. A development-environment interruption is recorded separately: completed
upgrade/foundation runs were retained, partial runs were preserved as interrupted,
and the remaining complete suites resumed against the same source hashes.

The unchanged original save-failure/retry probe also passed ten independent
candidate 6 runs, including actual Dashboard workflows and both saved payloads.
The same candidate 5 diagnostic sample retained one failure in ten.

Two added scenarios run in desktop English and phone Chinese. Holding the real
Dashboard module through successful setup must commit the destination URL,
show localized busy feedback and retain native page-search/focus recovery; after
release the actual workflows must appear. Empty-history first send holds a real
permission response after native URL assignment, requires the same textarea,
draft and Stop control to survive a shared-shell update, then crosses the real
fetch/SSE parser. It requires a complete persisted answer and source after
reload, one create/PATCH/message request and no cancellation or replay. This is
a finite owned SSE response; the original incremental Stop/late-stream tests
continue to cover in-flight stream ownership.

The existing held-memory-module, static no-JavaScript/main, permission, refund,
error, modal/focus and query-only report checks remain. API and capability gates
are unchanged. Hosted CI and exact committed-source review remain separate
publication gates; no failed hosted run is replaced by a retry-only green result.
