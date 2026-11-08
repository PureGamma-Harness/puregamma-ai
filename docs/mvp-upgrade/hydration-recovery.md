# Shared hydration recovery investigation

## Repository evidence

Frozen candidate: `2bb4473f77f266646cef0bf95d8e612cf51e0ddb`. Both full and
default launch route matrices complete228/228. Source contracts44 plus actual
React/browser probes26 pass. However, focused native navigation uncovers a
shared rendering problem and blocks merge:

- The first integrated auth sequence records React418 HTML hydration mismatch
  during initial loading of `/en/onboarding/channels`.
- The fresh candidate records the same error during a hard navigation to
  `/en/onboarding/style`, after asset selection, Back and reload assertions.
- Hosted Node22 smoke records it after browser Back to `/zh/options?currency=ETH`.
  Currency and owned SSR data assertions pass, while the page-error assertion
  correctly fails.

Actual client and server runtime artifacts use the matching Next-pinned React
canary; a manifest version mismatch is not established. Both local traces and
the hosted trace reach the host-element hydration branch, rather than a text
comparison. These observations do not establish a specific component cause.

## Execution prompt

Act as the shared web rendering maintainer. Keep the failed immutable artifacts
and compare SSR, streaming markers, first client render and native history
restoration. Seek the failing host/component using the preserved normal failures. A separately
proved SSR product regression may justify reverting the new boundary without
claiming the internal React failure has been uniquely identified.
Use a temporary diagnostic seam that preserves normal recovery and error
reporting; a passing instrumented run does not erase a failing normal run.
Select a minimal repository-grounded repair, preserve accessible loading/error
feedback, locale, query state, appearance and owned workflow data. Keep API
permissions, release gates, package policy and production deployment unchanged.

## Acceptance and independent review

1. Establish the specific product defect from actual source/runtime evidence
   and a meaningful regression; do not suppress page-error assertions or use
   retry to pass. State the limits of any internal framework attribution.
2. Preserve SSR sessions, query/locale history, onboarding choices, native
   mobile navigation and explicit unavailable states.
3. Verify frozen fresh production builds on supported Node22/24 paths, both
   route modes, the90 focused journey cases and relevant component contracts.
4. Require a separate agent review of the final repair and evidence before
   publishing an updated PR55; merge only after applicable CI succeeds.

## Bounded repair and verification

The new locale-wide loading file is removed. Page-owned loading, busy and
unavailable states remain, as does the shared locale error boundary. This
restores direct SSR of static setup content rather than initially hiding it in
a streamed segment outside `main`. It avoids introducing this broad fallback
contract into the pinned runtime; it does not claim a general React fix. Dynamic
server pages may wait for their response while the persistent shell remains;
their original loading/error journeys remain required acceptance checks.

Actual HTTP A/B reads confirm the change. Before, setup `main` contains only the
workspace skeleton; afterwards style/channels contain the real heading,
progress and controls directly. The new regression parses an inert HTML
document, never executes application scripts, and only inspects actual `main`
descendants. It covers assets/style/channels in English and Chinese, including
exact localized headings, current progress and relevant controls. The same
frozen test fails both projects on the original artifact and passes both on
the candidate. It does not forbid legitimate streaming in metadata or other
page-owned boundaries.

Response instrumentation, debugger, DevTools callback, direct-root polling,
synchronous diagnostic setter and a concurrent visitor load did not capture
the failing host. Their successful runs are diagnostic observations, not
replacements for the three normal failures. They are not shipped. Independent
architecture review accepts the scoped SSR rollback, pending unchanged native
navigation/error assertions and final production/CI regressions.

Candidate full production build: Node24,143pages passed. Same final HTTP test:
original0/2, candidate2/2. The original smoke14 and complete auth18 (including the two new HTTP cases)
also pass32/32 without any diagnostic hooks. Typecheck passes. Final integrated
route modes,92 focused checks and hosted CI remain required before merge.

