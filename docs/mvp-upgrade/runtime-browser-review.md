# Runtime browser regression review

The phase-aware page boundary and delayed-module regression in PR #56 passed
independent source review, all planned local validation and fresh hosted CI.
The exact seven-file head `e4d0a878cae4efdbdddce1ed090fb922c9ba99db` was merged
as `170e3c87ad9362037bf9b4db6ac420f2a4e7f376` on 2026-11-13 at 15:53:20 UTC.
The historical React #418 failures and
rejected candidates remain evidence; they are not results against current source.
This is the frozen PR #56 acceptance record. The later default-branch locator
and loopback-transport failures, followed by the separate PR #58 corrections,
are documented in [Streamed workspace locators](streamed-workspace-locators.md).

The reviewed `components/nav.tsx` SHA-256 is
`cf6ca364cc7fafde8beceae3e5d56569c8ff5bf75f86c5cef1f03da1e6fade34`, built as
`c5Fe5-FzSPR-t02cPjxC2`. The appended research test has SHA-256
`e4392964bb633f53de282b13d3a25507a98f2455fdb125d983f5f76a69abb908`.
All seven remote PR file blobs match the immutable commit and tested local
bytes. The branch includes the reviewed Harness update through merge parent
`84bed4b1f0915c1e93dd099ad6df4b067460324a`; at final review the PR base was
`b3bdf88f7c63ba5d53ec7ec9dd573e36b703d056`.

## Repository evidence and execution prompt

Review the existing Agent SaaS, its real consumers and actual failed runtime.
The original audit measured Gateway and Dashboard overflow. Gateway date controls
did not wrap, chart/provider grids imposed excessive minimum widths, and
Dashboard activity tracks inherited long titles' intrinsic minimum. Onboarding
success also reached a real Next dashboard whose server market, subscription and
report reads were outside browser-only request interception.

The subsequent hydration investigation captured an existing shared main whose
hydration cursor had entered its first content child. A separate unchanged
runtime probe held only the real Memory page-module response: the mobile menu
failed before release in four of four probes. This establishes a shared-control
responsiveness defect; those controlled probes did not themselves produce #418.

Act as the independent runtime reviewer. Review PR #56's seven source/test files
covering responsive layout, test-owned server reads and page-boundary hydration.
Review the four documentation closeout files separately. Preserve business and
page-error assertions, native navigation,
locale/query/session ownership, authentication, API semantics, provider policy,
timeouts and release gates. Review the public React contract against the pinned
renderer, then require ordinary production-artifact validation. Keep diagnostic
copies, historical reruns and current ordinary results distinct. Audit actual
CI executions by attempt; retained successful jobs are not new runs.

Acceptance:

1. Responsive fixes remain confined to measured containment defects. The added
   page Suspense boundary preserves the main landmark and shared controls;
   authentication, APIs, provider ownership and release policy remain unchanged.
2. Static HTML retains exactly one main and real, unhidden setup headings,
   progress and controls before scripts run. Fallback-only first paint fails.
3. A delayed real page module must not block shared navigation or appearance.
   Preserve its original bytes; prove a real static Memory heading, visible live
   main and no Memory API reads while held; then require actual Memory controls
   and original error guards after release.
4. The session-owned loopback fixture rejects writes and missing sessions,
   returns explicit unavailable data and closes its connections/listener.
   Existing destination and exact authenticated server-read assertions remain.
5. Ordinary smoke, foundation, authentication, research, operations and local
   full-route 236 pass on the revised artifact. Fresh hosted standalone full-route
   236 and separately built default-launch 236 must pass on the frozen commit.
   No additional local default-launch rebuild is required. Any original
   error-guard failure remains blocking; bounded successful repetitions do not
   prove a unique internal cause.
6. Counts distinguish source checks, isolated React probes, workflow journeys,
   canonical visits, release gates, auxiliary cases and geometry.

## Seven-file source scope and findings

| File or document | Independent assessment |
| --- | --- |
| `gateway-admin-console.tsx` | Date controls wrap; grid minimums clamp to available space while retaining desktop sizing. No API/action change. |
| `today-activity.tsx` | Zero-minimum tracks contain long titles; existing truncation and table scrolling remain. |
| `nav.tsx` | One permanent main contains a page-only Suspense boundary. Stable public server/client snapshots retain real SSR content and select a synchronous localized loader during client recovery. Shared controls and provider ownership remain outside the boundary. |
| `auth-onboarding-fixtures.ts` | Test-owned ephemeral loopback listener; 405 for writes, 401 for missing session and 501 for authorized unavailable reads; teardown closes connections/listener. |
| `auth-onboarding.spec.ts` | Existing save/retry and static-HTML checks remain. Exact forwarded market/subscription/report reads and visible localized destination navigation strengthen completion evidence. |
| `route-health.spec.ts` | Eight populated chart/date/card/table cases retain original page-error, non-write and width guards. Layout settling is bounded. |
| `research-workspace.spec.ts` | One appended scenario runs in two original projects. It holds only exact Memory page-module delivery and checks layout delivery plus actual controls before release. Original 27,812-byte prefix is byte-identical, SHA-256 `ce51a075bf9c1de3e38447742f190c4a86b182c35edd6414c0f226138f1e43f0`; configuration and existing guards remain unchanged. |

The separate four-file documentation closeout comprises `runtime-hydration.md`,
`runtime-validation.md`, this review and the MVP README. It records prompts,
evidence, rejected candidates, acceptance and counts after source acceptance;
discovery and historical results remain distinct from current execution.

The pinned Next 15.5.29 compiled client renderer exports
`19.2.0-canary-0bdb9206-20250818`; top-level React packages report 19.2.9.
Independent reads of `react-dom-client.production.js` support the phase fallback:
initial hydration claims a dehydrated boundary/comment and returns without
rendering its fallback (lines 6805–6839). Unwinding an existing dehydrated
Suspense boundary resets hydration state (8452–8461; reset at 2879), so a newly
mounted fallback reads `getSnapshot`, whereas hydration reads
`getServerSnapshot` (5560–5578). The repair uses this public snapshot contract;
it ships no internal React hook or diagnostic renderer.

`WorkspaceLoading` uses shared locale context and synchronous markup, without a
Memory module, API call or effect. Server fallback rendering does not run page
effects. Client fallback renders only the loader, rather than a second page
component tree. Standard Suspense Offscreen behavior still applies to an already
committed page that suspends: state can be retained and layout effects cleaned
up/reappeared. This does not mean every page effect is destroyed and recreated.
No router/cache/provider key or ownership was added. Existing upgrade coverage
exercises client onboarding navigation and Back.

Both earlier outer-main structures were rejected. A loader-main fallback passed
the targeted browser gate but produced two literal mains and hid real static
content in an outlined segment. Reusing the same real main as both primary and
fallback still produced two literal mains; its mobile gate also failed to open
navigation before release. Fizz can outline a completed boundary beyond its
12,800-byte progressive threshold, so hidden segments alone do not prove a
pending server promise. Those candidates' green probes do not approve this one.

Retaining real server fallback content has an HTML cost. Independent reads of
the retained baseline and current generated files found these increases; all
eight documents still contain one main:

| Route | Raw HTML increase | Gzip increase (`mtime=0`) |
| --- | --- | --- |
| `/en/onboarding/assets` | 8,207 bytes | 602 bytes |
| `/zh/onboarding/channels` | 7,532 bytes | 615 bytes |
| `/en/research` | 4,190 bytes | 537 bytes |
| `/zh/memory` | 3,021 bytes | 541 bytes |

Fizz's streaming protocol replaces the visible fallback with the outlined
primary segment. This avoids a duplicate main, not repeated child markup.
Compiled module/metadata IDs also differ, so the whole size delta cannot be
attributed solely to repeated children. This is artifact accounting, not a
latency or bandwidth benchmark, and the repair claims no performance gain.

## Frozen PR #56 ordinary evidence

The unchanged authentication suite passed 20/20 in 28.5 seconds on
`c5Fe5-FzSPR-t02cPjxC2`; independent log inspection confirms original static-HTML
checks executed. Smoke 14/14 and foundation 10/10 also passed. The strengthened
delayed-module gate passed 2/2 in 8.9 seconds on Node 22.23.4 with official
Chromium Headless Shell 149.0.7827.55, revision 1228. Its attachments establish a
real unhidden SSR heading, one visible main, completed layout delivery, zero
Memory reads, and actual desktop/mobile actions before release. Post-release
Memory controls and error guards passed.

The same artifact passed all 30 ordinary research cases and 20 bounded original
Chinese mobile journeys on official Chromium 149/Node 22; every recorded retry
was zero and every error list empty. A separate system Chromium
156.0.8078.79/Node 24.22.1 comparison passed 10/10 original Chinese mobile
journeys against this Node 22-built artifact. Its baseline had previously failed
once in ten. Browser versions and those original failures remain separate.
Independent reads also confirm Node 59/59, copied standalone 5/5 and real React
26/26 log totals. Operations passed 22/22, completing the 96 focused cases.
The single local full-route run passed 236/236 in 399.48 seconds: 118 cases per
project, with no skipped cases, retries, flaky results or errors. Its 216
canonical browser visits, 12 auxiliary and eight geometry cases include 230
browser cases and six HTTP/discovery cases. Runtime/build/source identities
remained frozen. The separate targeted gate, bounded repetitions and two
ephemeral viewport checks are additional evidence, not additions to those suite
totals. Local source acceptance is complete.

The older `N6Zdw5MakeeNSuBethbno` gate result is not current-artifact validation.

## Fresh frozen-head CI and decision

Independent final GitHub reads confirmed PR #56 still pointed to
`e4d0a878cae4efdbdddce1ed090fb922c9ba99db`, with seven files and no merge
conflict. All three check runs completed successfully on that head. Both
workflows executed attempt 1; none required a rerun.

| Fresh workflow and job | Actual execution |
| --- | --- |
| [Web 43455484402](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43455484402), standalone 131988369851 | Node 59, copied standalone 5, real React 26, focused 96 and full routes 236 all pass. |
| Same Web run, launch 131988369592 | Separate default-policy build; default-launch routes 236/236 pass, including all eight geometry cases. |
| [API 43455484443](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43455484443), job 131988369624 | 1525 passed, four expected failures and one opt-in load skip; Relay separately 8/8. |

The reviewer and a second CI-evidence agent each read the final standalone log.
It actually executes both new delayed-module cases: desktop research case 15
and mobile case 30, passing in 723 ms and 698 ms. Focused totals are
14 + 10 + 20 + 30 + 22 = 96. Runtime totals remain 8 + 5 + 2 + 44 = 59,
with the copied five and real React 26 separate. Full routes pass 236/236 in
4.1 minutes; the newly built launch job passes 236/236 in 3.0 minutes.
Hosted logs confirm Node 22.23.4, pnpm 10.28.2 and official Chrome for Testing
plus Headless Shell 149.0.7827.55, revision 1228.

No unresolved source, fixture, assertion or acceptance blocker remains.
Independent decision: approve merge of the exact head above, using an expected
head check. The measured delayed-module responsiveness repair and current
ordinary error-guard success support this acceptance; they do not establish a
unique internal explanation for every historical hydration failure.

Subsequent independent GitHub reads confirm PR #56 is closed and merged with
that exact head. The merge commit's tree `9d2b46785446fd877bdd4b1a1d684fba17902e08`
matches the approved source tree. The four-file documentation closeout is
separate; later site changes and post-merge workflow observations do not alter
the 96-case frontend acceptance recorded here.

## Historical hosted accounting

The original five-file review matched all five local Git blobs to remote PR #56
head `93bca15cf2f8b9130c2fee1857172336b7e3b5e9` and found no introduced layout or
fixture blocker. It used remote source/log inspection and local byte/hash reads,
without running local builds, tests or browsers. This predates the page-boundary
repair and appended regression.

[Web run 42971279348](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/42971279348)
attempt 1 standalone job 130360081817 passed authentication, then failed Chinese
mobile research: 27/28. Operations and full routes did not execute in that job.
Attempt 2 standalone job 130363236373 passed all stages. Launch job 130360082243
passed on attempt 1; attempt 2 listing 130363238081 retains identical times and
decoded logs, so it was not rerun. These jobs cover the old head and cannot
substitute for fresh final-head CI.

| Check | Exact accounting |
| --- | --- |
| Node checks | 59 = dependency 8 + runtime 5 + offline 2 + product contracts 44 |
| Copied standalone outside checkout | Separate 5 |
| Real React/browser probes | Separate 26 |
| Original hosted focused journeys | 94 = upgrade 14 + foundation 10 + auth 20 + research 28 + operations 22 |
| Current focused discovery | 96; research grows from 28 to 30 through one scenario on two projects |
| Full routes per mode | 236 = canonical browser 216 + auxiliary 12 + geometry 8 |
| Default-launch routes per mode | 236 = canonical browser 148 + gates 68 + auxiliary 12 + geometry 8 |

The eight geometry cases are two locales × two projects × two screens. Gateway
mobile additionally resizes through 320/360/390/430px; desktop uses 1440px.
Dashboard cases cover 390/1440px, not every Gateway width. The new research gate
does not add cases to the separate 236-case route suite.

[API run 42971279347](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/42971279347)
passed 1525 tests, with four expected failures and one opt-in load skip; Relay
checks passed 8/8 separately. Hosted logs identify Chromium/Headless Shell
149.0.7827.55, revision 1228. Earlier system Chromium 156.0.8078.79 observations
are separate evidence.

The fixtures verify owned UI behavior and explicit unavailability without
claiming external-provider readiness or every route's mutation workflow.
Authentication, production services, provider policy and release gates are
unchanged. Frozen source approval, local acceptance and fresh hosted evidence
and the exact merge result are reconciled above.
