# Shared runtime hydration review

## Scope and execution prompt

Maintain PureGamma's existing Agent SaaS from PR #56 at
`93bca15cf2f8b9130c2fee1857172336b7e3b5e9`. Preserve ordinary startup,
authentication, locale/query/session ownership, accessible feedback, appearance
preferences, business assertions and every page-error guard. Tie repairs to
actual runtime evidence; do not change providers, dependencies, release gates or
production services to guess past a rendering failure.

Use isolated diagnostic runtime copies. Record component stacks only inside the
existing Next recoverable-error callback, retaining the original reporting path.
If necessary, save references only in the already-failed host-match branch and
serialize them after failure. Preserve original artifact hashes, literal edits
and syntax validation. Do not add startup hooks, polling, prototype patches or
debugger instrumentation. Diagnostics must not ship.

Validate the concrete delayed-module user scenario, unchanged inert-HTML
contract and ordinary suites before hosted CI and final frozen-head review.
Successful repetitions do not erase an earlier failure.

## Evidence and repair

Hosted run 42971279348 attempt 1 reported React #418 on the Chinese mobile
memory journey; attempt 2 passed on the same source. Earlier removal of the
locale loading file restored static setup content but did not eliminate #418.

Isolated passive diagnostics subsequently captured the shared AppShell `main`
in the recoverable component stack. Two bounded cursor captures reproduced
three and four failures respectively in 20 original Chinese mobile runs with
Node 22 and official Playwright Chromium 149. The expected host was
`main#main-content`, while the actual cursor pointed to its existing first
page-content div. Saved expected and hydration-parent fibers both identified
host main; serialized flags/state nodes can change during recovery. These
captures locate a shared hydration/retry seam without proving every internal
cause across timing conditions.

A separate unmodified baseline probe held only the memory page module response,
with React and the locale layout already loaded. Four of four probes left the
mobile menu unresponsive until release. Original response bytes were preserved
(SHA-256 `f4182f59922dcc77dc9942bece728a6a05ca32dd7f5e464fe927f8eb5c4038b7`).
This establishes a concrete slow-network usability defect independently of #418.

Two outer-main Suspense candidates were rejected. A loader main fallback hid
real static content; an identical real-main fallback still produced two literal
mains. The pinned Fizz renderer can outline completed large boundaries above
its progressive threshold, so waiting for all promises or moving the same local
boundary to a Server Component does not guarantee a single main.

The current repair keeps the permanent main outside a Suspense boundary around
page children. `MainContentFallback` returns real children during SSR and the
existing localized WorkspaceLoading during client recovery, using the public
`useSyncExternalStore` server/client snapshot contract. Stable no-op subscription
and snapshot functions introduce no event listener. The hook is confined to the
fallback and does not alter business state initialization.

The pinned client renderer resets hydration state when a dehydrated boundary
unwinds; a newly mounted fallback then reads the client snapshot. Normal
completed-boundary hydration restores primary children. The main ID, tab index
and classes remain, and navigation, native drawer, header, appearance controls
and providers retain their ownership outside the page boundary.

## Frozen source review

Source: [PR #56](https://github.com/PureGamma-Harness/puregamma-ai/pull/56),
commit `e4d0a878cae4efdbdddce1ed090fb922c9ba99db`, pushed and independently
approved. Production source and the reviewed bundle identity remain unchanged
through the final local checks.

BuildID: `c5Fe5-FzSPR-t02cPjxC2`.

Reviewed `apps/web/components/nav.tsx` SHA-256:
`cf6ca364cc7fafde8beceae3e5d56569c8ff5bf75f86c5cef1f03da1e6fade34`.

No blocking source findings. The loader requires no delayed feature module;
there are no dependency, metadata configuration, error-guard or provider-policy
changes. An independent parse of six generated English/Chinese setup documents
matches all unchanged inert-HTML fields: one main, visible actual heading,
localized progress, one current step and real choices or delivery form.

## Validation status

The coordinator and validation agents report these checks passing on the frozen
candidate, with original error guards retained:

| Check | Result |
| --- | --- |
| Strengthened delayed-module desktop/mobile regression | 2/2 |
| Original authentication/onboarding, including inert HTTP setup contract | 20/20 |
| Node checks: 44 product, 8 dependency, 5 runtime, 2 offline | 59/59 |
| Isolated runtime checks | 5/5 |
| Real React checks | 26/26 |
| Cold smoke | 14/14 |
| Foundation | 10/10 |
| Account operations | 22/22 |
| Research suite with original assertions retained | 30/30 |
| Original Chinese mobile flow, official Chromium 149 / Node 22 | 20/20 |
| Original Chinese mobile flow, system Chromium 156 / Node 24 | 10/10 |
| Full routes, desktop and mobile | 236/236 |

The full route run has zero retries, skips, flaky cases or original page-error
failures. Browser validation confirms the original research fixture/assertion
prefix is unchanged. Final local summaries are
`/workspace/scratch/round7-browser-validation/phase-final-validation-summary.json`
and `/workspace/scratch/round7-routes-operations/full-routes-summary.json`.

The strengthened regression verifies an inert Memory response with one visible
actual heading inside one main. With the feature module still held and its API
calls at zero, layout loading has completed, the live main remains singular,
and desktop Classic appearance controls or the mobile drawer open and close
before release. After release, original Memory behavior and page-error guards
pass. A legitimate client loading fallback is distinguished from inert SSR
content; the original SSR assertions remain unchanged.

Fresh [Web CI](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43455484402)
passed on attempt 1: full routes 236, a separate default-launch build/routes 236,
and all focused/runtime checks. Fresh
[API CI](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43455484443)
also passed: 1525 tests, four existing expected failures, one opt-in load skip
and eight separate Relay checks. Independent review matched all seven remote
source/test blobs to the tested source. PR #56 was merged as
`170e3c87ad9362037bf9b4db6ac420f2a4e7f376` after those checks passed.
The measured usability repair and passing checks do not prove a unique internal
cause for all historical hydration failures. The original error guards remain.

Diagnostic manifests, bundle hashes, literal edits, traces and independent
source evidence remain under `/workspace/scratch/round7-hydration/`; none are
production changes.

A later default-branch run failed a different assertion: a page-wide composer
locator matched a hidden streamed copy as well as the rendered field. Its trace
contains no page-error event. That observation and the strict region-scoped test
correction are recorded separately in
[Streamed workspace locators](streamed-workspace-locators.md).
