# Streamed workspace locator follow-up

## Evidence and execution prompt

PR #56's frozen source passed its fresh CI before merging. The subsequent
default-branch [Web run 43457115513](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43457115513)
failed one desktop news-to-Agent case: research 29/30. Launch routes passed
236/236; operations and full routes were skipped after the research failure.
The separate API job passed 1525 tests and eight Relay checks, with four existing
expected failures and one opt-in load skip. These results remain separate from
the preceding successful reviewed-head run.

The failed document was `/en/chat?topic=Current%20ETH%20headline`, HTTP 200,
77,593 bytes. Independent inspection found one main landmark, one composer
inside it, and another staged outside it in `body > div#S:1[hidden]`.
The response contains the matching Fizz replacement call. The trace records no
page-error event; a later snapshot contains only the main's composer. It does
not establish two simultaneously visible product fields. This failure differs
from the earlier React #418 investigation.

Act as the research browser-test maintainer. Read the original trace and DOM
ownership before changing an assertion. Follow the user's accessible workspace
through hydration and replacement. Keep strict matching, enabled/value/draft
checks, original actions, zero automatic sends, overflow and page-error guards,
timeouts and retry settings. Do not choose an ordinal match, suppress an error,
add sleeps, change production code or rerun old CI as the repair.

## Change and independent review

The first [PR #58](https://github.com/PureGamma-Harness/puregamma-ai/pull/58)
head, `e74a9bf4a83e2005e2f3988ede5a29a5943909fb`, changed one test file. A helper scopes
all seven composer lookups to the semantic main region. A genuine pair of
matching composers within that region still fails strict matching. Disabled
fields, a wrong topic, an unexpected send or a page error still fail the existing
assertions. Main-count checks remain owned by the existing HTTP/route/module
tests; the helper does not introduce a separate main-count assertion.

Two independent reviewers removed the helper and reversed the seven calls.
The result matched the original file byte for byte. Production source and the
previously frozen artifact were unchanged. This proves the patch changes locator
ownership rather than business expectations. It also means PR #56's earlier
unchanged-prefix hash is historical evidence, not the follow-up file's hash.

## Validation

On Node 22.23.4 and official Playwright Chromium 149, the ordinary research suite
passes 30/30 in 51.2 seconds against the same production artifact. Changed-E2E
TypeScript passes. A separate bounded repetition of the original desktop
news-to-Agent case passes 10/10 in 34.7 seconds, with unchanged guards and retry
index zero. The repetition is not included in the 30-case suite total.

Fresh full/default-launch Web and API checks are the merge requirement for this
follow-up. Their exact results and merge are recorded in the final coordination
summary and [PR #58 checks](https://github.com/PureGamma-Harness/puregamma-ai/pull/58/checks).
The original failed run, artifact 14055096293 and independent trace summaries
are retained under `/workspace/scratch/round7-postmerge170-independent-failure/`.

## Owned loopback connections

The first PR #58 head, `e74a9bf`, then passed all 96 focused journeys, full routes
236/236 and API checks in fresh CI. Its independent launch job failed 1/236:
four forwarded GETs reported `ECONNRESET` during the Chinese Dashboard geometry
case. Two simultaneous reads still returned complete unavailable responses.
Trace ordering places the reset before after-hooks, page closure and backend
teardown, so early fixture destruction is not established as the cause.

Act as the owned-fixture maintainer. Reconstruct request and teardown ordering,
then inspect the installed client and server connection policies. Use isolated
real-HTTP controls to test the implicated mechanism. Preserve the read-only
dispatcher, synthetic session, payloads and every original route/error guard.
Finish response bodies before closing connections; validate actual requests
across contexts rather than a header string. Keep fault injection and client
transport hooks in scratch; passive connection identity may be recorded as
fixture evidence. Require independent source review plus fresh CI.

The pinned Playwright client uses module-level HTTP agents shared across request
contexts within its Node process. Its custom keep-alive agent has no explicit
timeout; the pinned Node 22 code does not turn the server's idle hint into a
finite timeout for that construction. Successful trace reads show socket reuse;
the failed sockets' identities were not captured. A controlled real-HTTP probe
closes only server-idle connections after a client selects a reused socket. It
reproduces one reset with the old policy, while explicit response closure yields
six complete responses, no reuse and a still-listening server. This demonstrates
the mechanism without claiming the exact historical timeout trigger is known.

The fixture now normally closes each response after its complete JSON body.
Passive socket IDs let a new HTTP regression verify 13 authenticated reads
across two real request contexts, complete identical payloads and 13 distinct
connections. The original policy returns all payloads but fails that resource
contract with only six distinct connections. The repaired policy passes on both
projects. Request dispatch, session checks, statuses, payloads, read-only policy,
proxying, original route cases, timeouts and error assertions are unchanged.
The diagnostic socket hook remains in scratch; it is not part of the fixture.

This adds one HTTP scenario on each project. Discovery becomes 238 per mode:
full 216 canonical visits +14 auxiliary +8 geometry; launch 148 canonical browser
visits +68 gates +14 auxiliary +8 geometry. Full mode has 230 browser cases and
eight HTTP/discovery cases; focused journeys remain 96. The final frozen
three-file follow-up head is `c4e2fdd14f93e9fe70c3b3648db291022eafbff6`.
The original eight geometry cases pass again, including the failed Chinese
Dashboard case, and changed-E2E TypeScript passes. Fresh CI is the final merge
requirement for this revised head; old failed runs remain distinct evidence.
The complete local full-mode suite also passes 238/238 in 334.62 seconds with
zero skips, retries, flaky cases or errors. Its three source hashes and production
BuildID remain unchanged before and after the run. This local full-mode result
does not substitute for the separate default-launch production build in CI.

## Frozen-head acceptance

Fresh [Web run 43461686491](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43461686491)
and [API run 43461686233](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43461686233)
passed on attempt 1 against final head `c4e2fdd14f93e9fe70c3b3648db291022eafbff6`.
Independent decoded-log review confirms 59 Node, five copied-runtime, 26 real
React and 96 focused checks, full routes 238 and default-launch routes 238.
The original news-to-Agent case, delayed-module regression and new connection
regression execute successfully on both projects. API passes 1525 tests plus
eight Relay checks, with four existing expected failures and one opt-in load skip.

All three remote file blobs match the independently approved source. PR #58
merged as `38b5eea3d506a8ca992a95b714605028d29a57bf` after those checks passed.
The separate default-push [Web](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43463254218)
and [API](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43463254173)
executions remain distinct from that frozen-head acceptance. No old failed CI
run is rerun or reclassified as a successful repair.
