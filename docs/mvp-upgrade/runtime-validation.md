# Runtime browser validation: execution prompt and acceptance

## Repository evidence

Baseline: PR56, `93bca15cf2f8b9130c2fee1857172336b7e3b5e9`.

The existing research workspace implements persistent Agent history, bounded
research requests, source/artifact reading, memory consent, report selection,
and attributed news drafts. Its execution brief is [Research UI](ui-research.md).
The production suite at that baseline in
`tests/e2e/playwright/research-workspace.spec.ts` has 14 scenarios on desktop
and a 390px phone, giving 28 cases. `playwright.research.config.ts` starts the
real standalone server on loopback 3212, uses one worker, a 35-second test budget,
10-second web-first expectations and retained failure traces. It does not
configure retries or reuse an existing server.

The latest hosted failure is the mobile Chinese research/memory/report case.
It navigates from `/zh/research` to `/zh/memory` and then an owned report. Its
business assertions can succeed while the unchanged page-error assertion catches
React 418 HTML hydration failure. A successful same-source rerun is evidence of
an intermittent result, not a demonstrated repair. The previous locale-loading
rollback proved a static-SSR improvement but did not resolve all later 418 errors.

## Execution prompt

Act as the independent browser-validation engineer for the repository's current
Agent SaaS. Read the real configuration, fixtures and workflow assertions before
running them. Start only after the coordinator freezes a production build and
confirms its source, build ID, and copied public/static assets. Preserve all
original business assertions, page-error checks, time budgets, local sessions
and feature gates. Use the original ordinary suite without new hydration hooks,
debugger attachment, response rewriting or global-error suppression.

First run the complete 28-case research suite against the frozen baseline. If
the fault remains intermittent, use a separately identified, bounded repetition
of the unchanged Chinese mobile case to reproduce it; record every outcome and
do not combine later successes into a false clean baseline. Coordinate its
ordinary 3212 server with the separate diagnostic runtime owner, who uses another
port and modifies only a copied error callback after an error has occurred.

Use semantic Playwright assertions and actual HTTP/ReadableStream/AbortSignal
behavior to validate request ownership, consent, native navigation and recovery.
Existing narrow transport probes inside the test remain unchanged; add no
general-purpose startup instrumentation. Retrieved sources remain evidence,
and an error or empty fixture must never imply provider readiness, execution
authority, a refund or a completed chargeable run.

Record exact source/configuration hashes, source commit, build ID, Node/browser
versions, command, exit status, per-case outcomes and artifact paths. On failure,
preserve the trace and final context before further work, identify the actual
navigation and distinguish business failure from a later hydration failure.
After an independently reviewed repair, repeat the required ordinary suites on
the new frozen artifact and inspect representative desktop/mobile screenshots.
Keep baseline, diagnostic, component, whole-route and final acceptance evidence
separate. The coordinator owns builds, source integration, CI and merge.

## Acceptance and isolation

- Research create/list/detail, evidence and complete Markdown artifacts remain
  usable; rejected creation retains its question and opens no fabricated run.
- History actions remain server-confirmed, failed pre-stream sends retain their
  draft, Stop aborts setup/streaming, and stale cancellation/history reads cannot
  replace the current run or authoritative settlement.
- Memory read failures remain explicit; known privacy-restricting controls stay
  usable, and retries cannot overwrite an acknowledged setting change.
- Report deep links, filters, phone focus and Chinese labels retain the selected
  owned result. News drafts never submit themselves.
- Original page-error checks must pass without filtering 418 or extending
  timeouts. An unexpected script error remains a release blocker even when the
  visible business assertions pass. Bounded reproduction is not test retry.
- Use only each test's ephemeral 127.0.0.1 backend and explicit synthetic users,
  reports, conversations and evidence. Research-suite mutations are fake fixture
  requests, not the read-only whole-route audit or real account changes.
  The existing server fetch guard and browser origin/WebSocket interception
  remain. No real model/provider, trade, payment, notification or deployment is
  performed. Test pages, proxy routes, browsers and listeners close normally.
- Ordinary screenshots substantiate the actual tested viewport/theme, not a
  complete accessibility certification or native-mobile acceptance.

## Reproduction and current status

From `apps/web`, after the coordinator prepares the frozen standalone assets:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  corepack pnpm@10.28.2 exec playwright test \
  --config playwright.research.config.ts \
  --output /workspace/scratch/round7-browser-validation/baseline-artifacts
```

The optional `PLAYWRIGHT_RESEARCH_PORT` changes only the ordinary server port.
No application flag or test assertion is changed. A specifically authorized
reproduction may select the original mobile Chinese case with `--project` and
`--grep`, and record an explicit finite `--repeat-each` separately from release
acceptance.

## Baseline execution and bounded reproduction

The coordinator froze source `93bca15` and BuildID `b-W0ybbOErBMSkgAYj2cS`.
This agent verified 16 public and 145 static files byte for byte against the
standalone copies, plus 9 relevant source/configuration hashes. Node 24.22.1
and system Chromium 156.0.8078.79 were used. The installed Playwright 1.61.1
pins Chromium 149.0.7827.55/revision1228, so local and default hosted browser
versions are recorded separately.

The ordinary original research suite completed 28/28, exit 0, in 55.8 seconds.
The separately named original Chinese mobile reproduction then completed
9 passed/1 failed, exit 1, in 36.6 seconds. Its third case (repeat index 2) raised the
same React 418 HTML error; both original error assertions failed after the
business assertions completed. Every attempt retained retry index 0. No source,
assertion, timeout, diagnostic hook or response rewrite was added.

The failing trace places the error during a hard navigation to `/zh/memory`,
approximately 494ms after navigation started and before the next report
navigation. The actual memory HTTP response contains all title/meta elements
inside head and no pending or hidden streamed segment. Streaming metadata in
body is therefore not necessary for this observed failure. Lost root appearance
attributes are consistent with whole-document recovery; they do not identify the
original failing host or prove a page-local or shared component cause.

Source/configuration hashes and BuildID remained unchanged after both runs,
and the ordinary 3212 listener was released. The 28-case pass does not erase the
reproduced failure or the original hosted failure. At that baseline checkpoint, release remained on hold
pending a demonstrated repair and fresh ordinary acceptance. During that baseline phase this agent did not
change production or test source, trigger CI, publish or merge.

Machine results, failure trace/timeline, raw failing HTML and four ordinary
research/report screenshots are retained under
`/workspace/scratch/round7-browser-validation/`. The coordinating handoff is
`handoff.json`; baseline and bounded reproduction summaries remain separate.


## Deterministic shared-shell regression

After the baseline failure, the coordinator captured a hydration retry that
expected `main#main-content` while the renderer cursor already pointed at that
existing main's first child. A root-owned controlled probe held the unchanged
Memory page-module response while layout/React code arrived: the old artifact's
navigation failed before release in 4/4 probes. A provisional MainRegion/Suspense
candidate passed the same 4/4 probe. Those causal probes are coordinator evidence,
not results independently rerun by this agent.

The follow-up test design is recorded in
`/workspace/scratch/round7-browser-validation/shell-chunk-gate-plan.json`.
One semantic scenario was appended to `research-workspace.spec.ts`; the original
27812-byte prefix, including all 14 scenarios and every existing error guard,
remains byte-identical (SHA256 `ce51a075bf9c1de3e38447742f190c4a86b182c35edd6414c0f226138f1e43f0`).
The suite now has 30 cases across its unchanged two projects.

The test matches the decoded locale Memory `page-*.js` path without a content
hash, fetches and retains the original response, and holds only its delivery.
It waits for the locale layout response to finish using the existing expectation
budget. Before releasing the feature response, mobile must open and close the
existing navigation dialog; desktop must use the visible appearance control to
switch to Classic. Both actions must complete while the release flag is false
and the document must have one main. A `finally` block always releases the
response. The test then requires the original Memory controls, route, visible
main, absence of page overflow and the original empty error list. It adds no
startup diagnostic, production fixture, dependency, timeout or retry.

Against provisional BuildID `N6Zdw5MakeeNSuBethbno`, the two ordinary candidate
cases passed 2/2, exit 0, in 7.3 seconds with the Node 22 PATH and default official
Playwright 149 headless shell. The recorded attachments confirm one held 200
feature response, a completed 200 layout response, and each action completed
before release with no errors. The original Memory checks also passed after
release. Evidence is `shell-chunk-gate-candidate-summary.json` and its raw
results/log/artifacts under the same scratch directory.

This targeted result does not pass final release. Independent static-HTML
inspection found two main elements and the loading fallback as the first main
in this provisional candidate, so its existing SSR contract remains unresolved.
No existing SSR assertion was weakened. Use of that provisional build was
paused while the coordinator repaired SSR and rebuilt. This agent's only test
edit is the appended scenario; production code remains owned by the coordinator.


## Phase-aware fallback candidate

The coordinator then froze BuildID `c5Fe5-FzSPR-t02cPjxC2` from the phase-aware
fallback implementation, built with Node 22. The permanent main now sits outside
the Suspense boundary. Before running the candidate this agent strengthened only
the appended scenario: the actual navigation response is parsed with an inert
DOMParser and must contain one main, its actual `Agent 记忆` heading, and no hidden
ancestor of that heading. The live main must be unique and visible. Both before
and after the shared-shell action, while the module response is held, the
existing local backend must have received zero Memory API requests. Live page
content may legitimately enter its client loading phase; the test does not
require the live heading to survive that phase. All original SSR and error
assertions remain unchanged.

The strengthened two-project gate passed 2/2, exit 0, in 8.9 seconds using Node
22.23.4 and official Chromium Headless Shell 149.0.7827.55/revision1228. Both
attachments confirm the real unhidden SSR heading, one held 200 feature response,
a finished 200 layout response, zero Memory API requests, and completed desktop
Classic/mobile dialog actions before release with no errors. The original
Memory controls passed after release. The original 27,812-byte test prefix
remains byte-identical, and the configuration and original fetch guard are
unchanged. Evidence: `shell-chunk-gate-phase-summary.json` and its raw
results/log/artifacts in the same scratch directory.

The same frozen artifact subsequently completed these separately recorded checks:

| Browser and runner | Check | Result |
| --- | --- | --- |
| Official 149, Node 22 | Strengthened shared-shell gate | 2/2, exit 0, 8.9s |
| Official 149, Node 22 | Ordinary complete research suite | 30/30, exit 0, 67.9s |
| Official 149, Node 22 | Original Chinese mobile case, bounded repeat20 | 20/20, exit 0, 81.8s |
| System 156, Node 24 | Original Chinese mobile case, bounded repeat10 | 10/10, exit 0, 43.5s |
| Official 149, Node 22 | Scratch scroll-top viewport inspection | 2/2, exit 0, 6.0s |

All cases used retry index 0 with unchanged budgets and page-error guards; no
failure, skip or flaky result was recorded. The system-browser check was one
explicitly authorized comparison against the baseline's same browser and Node
runner, where the original repeat10 produced one React 418 error. It included a
stop-after-first-failure limit, which was never triggered. These bounded results
corroborate the repair and preserve the earlier failure; they do not replace the
ordinary suite or independently guarantee the absence of every race.

For visual inspection, two ephemeral scratch cases reused the original fixture,
including its isolated backend, outside-origin block, WebSocket closure and
page-error teardown. The only fixture difference was absolute module resolution
from the scratch directory. Both pages were at scrollY 0 and had a unique visible
main, no root overflow and no page errors. The 390×844 Chinese research screen
shows readable task controls and the actual saved fixture run; the 1280×720 report
screen shows its header/sidebar, archive and selected ETH report detail. Both
viewport screenshots were inspected. The earlier full-page captures preserve
their scrolled fixed-element positions and are separate evidence.

The coordinator integrated the already tested implementation as `e4d0a878` while
final documentation was being written. Recorded source/configuration/fixture
hashes remained unchanged throughout these runs, BuildID remained
`c5Fe5-FzSPR-t02cPjxC2`, and the original 27,812-byte prefix is explicitly checked
against baseline `93bca15`, independent of the moving branch HEAD. The ordinary
3212 listener was released after inspection. The coordinator's independent
HTTP/no-script and broader-route checks, fresh hosted CI and PR #56 merge are
recorded in the [frozen-source review](runtime-browser-review.md). They remain
separate from this report's ordinary browser evidence.

The complete handoff is
`/workspace/scratch/round7-browser-validation/phase-final-validation-summary.json`.
Separate machine summaries are `shell-chunk-gate-phase-summary.json`,
`phase-research30-summary.json`, `phase-chinese-mobile20-summary.json`,
`phase-system156-chinese-mobile10-summary.json`, and `viewport-review/summary.json`.
Their raw JSON, logs, traces and images remain alongside them.

The later post-merge locator failure and its separate correction are documented
in [Streamed workspace locators](streamed-workspace-locators.md). The unchanged
27,812-byte prefix above describes PR #56's frozen acceptance; the follow-up
changes seven locator ownership expressions and adds a helper, while preserving
all original business and error assertions.
