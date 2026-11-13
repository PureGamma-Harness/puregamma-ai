# Workspace workflow acceptance

## Execution prompt

Use the existing PureGamma application and its measured visual baseline to
validate the working Agent SaaS in a real browser. Exercise actual navigation,
editable drafts, evidence, account facts, native dialogs and loading boundaries
against owned offline data. Keep existing billing, permission, cancellation,
error, async-ownership and timeout checks. Review the tests independently. Do not
replace application behavior with DOM lookalikes, send messages, call providers,
contact outside services or invent a successful quote.

## Acceptance and coverage

The [suite](../../tests/e2e/playwright/worldclass-experience.spec.ts) has ten
scenarios across Chromium desktop 1440×1000 and phone 390×844: **20 tests**.
The [configuration](../../apps/web/playwright.worldclass.config.ts) keeps a
35-second case budget, 10-second expectations, one worker and zero retries.

- Dashboard questions preserve English/Chinese text, punctuation and Unicode
  through canonical `topic` URLs into an editable draft. Legacy scalar `prompt`
  is accepted only when `topic` is absent. Blank values, repeated parameters and
  the 4,000-code-point boundary do not send a message.
- The native page finder navigates actual destinations. Filtering, no matches,
  Arrow/Enter, Escape, focus return and rapid close/reopen work. Actual history
  dialogs retain modal ownership.
- Pending identity stays pending even when a real capability response publishes
  quota over a cached identity. Unknown credit remains unavailable, confirmed
  zero remains zero, and a transient refresh failure preserves confirmed facts.
- Account usage follows the backend's finite numeric quota contract. Missing or
  null values display `—`; they never establish an unlimited plan. Real zero
  remains zero. English/Chinese password and messaging labels address real
  controls; verification stays absent before an explicit challenge.
- Research reaches the first real result early, has one page h1 and leads
  completed work with the full artifact and evidence before disclosed process.
- A real detail-module request can be held before entering the list. Clicking
  the actual run still commits its URL and localized loading state, the shared
  page finder remains usable, and detail API effects have not mounted. Releasing
  that request must reveal the complete artifact body and source evidence.
- Report deep links lead with the selected reader. Phone Back restores archive
  search focus; filtering and selection preserve values, query and actual body.
- Empty and populated Agent workspaces retain a visible title and reachable
  composer. Rich Markdown cannot introduce another page h1. Real recorded cost
  and source links remain present.
- Unavailable research, reports and account facts remain distinct from empty
  data or signed-out controls. Root horizontal overflow is rejected.

The [fixture](../../tests/e2e/playwright/worldclass-fixtures.ts) is loopback-only
and GET-only. The existing automatic POST quote read is declined locally with
HTTP 503; it is never forwarded and no quotation is fabricated. Every other
browser non-GET is recorded, rejected with 405 and fails the suite. The server
independently rejects non-GET requests. Outside requests and WebSockets are
blocked; the existing GTM script attempt is counted as blocked. Unknown outside
attempts and every page error fail. Final guards run after handler drain and
page close. Each case saves request records; selected cases also save viewport
PNG and geometry JSON.

## Preserved existing suites

The foundation suite retains its ten cases. Its appearance check now requires
one desktop style control, then exercises the real phone drawer with storage
blocked and verifies state returns to desktop correctly. The desktop case also
passively checks the complete active Account row at 1024×720 and after a resize
to 640px height, then returns to Dashboard through the page finder and checks the
upper row. Each check requires intersection within the sidebar's own scroll
viewport and `window.scrollY === 0`; the test does not scroll the row for the app.

The auth suite retains its twenty cases and adds two controlled Dashboard
module-delay cases: desktop English and phone Chinese. A successful owned save
must commit the destination URL and localized busy main while the module is
held. The real page finder must keep its keyboard/focus behavior, and releasing
the module must reveal the actual Dashboard workflows without another save.

The research suite retains its thirty cases and original business, error,
async, no-auto-send and time-budget checks. Two additional first-send cases
verify that native history assigning a conversation URL preserves the mounted
composer, pending permission and message transaction. The owned responses then
complete through the real SSE parser; the recorded answer and source survive a
reload, with no cancellation or replay. These cases use local mocked writes.
Phone report tests deliberately return to the archive before filtering or
selecting a different record. History deletion checks inspect the actual visible
conversation panel and the error location appropriate to desktop or phone.

## Candidate 6 verification

Frozen candidate: `_wPIb-jZhMuN5vgU83CPH`, Node 22.23.4 and official Playwright
Chromium 149.0.7827.55. All 306 production-source hashes and the current suite,
fixture and configuration hashes match before and after the complete run.

The unchanged twenty-case product suite passes **20/20**, zero retries
(1.3 minutes). It records 370 GETs to the owned fixture, 13 locally declined quote
reads, zero mutation attempts, zero unexpected outside origins and zero page
errors. All 49 analytics-script attempts were blocked. An earlier run was
interrupted by an environment restart after the desktop ten cases; its partial
log is retained and excluded from this complete result.

The completed focused browser matrix is **120/120**: upgrade 14, foundation 10,
auth 22, research 32, operations 22 and product workflows 20. The first two
completed suites were retained across the restart after confirming the same
build and source hashes. Auth, research, operations and the product suite each
completed in a fresh full run after recovery; partial interrupted auth results
are excluded. Existing budgets and zero automatic retries remain unchanged.
The four added regression cases also pass in targeted runs: two held-Dashboard
cases and two first-send ownership cases. They are counted once in the matrix.
The additional React 26/26, Node 67/67 and copied-workspace 5/5 checks also pass
against this candidate; together with the focused browser suites, 218 checks
complete successfully.

The new Dashboard module-delay test also ran once against the preserved
candidate 5 runtime with the same 60-second case budget, 15-second expectations
and actions, browser, viewports and zero retries:

| Held Dashboard module, after one successful owned save | Preserved candidate 5 | Candidate 6 |
| --- | --- | --- |
| Desktop English and phone Chinese | Both retained failures: URL stayed on setup at 15 seconds | Both pass: destination URL/loading/search while held, then actual workflows |

The control's application/runtime code and 21 internal symlinks match before and
after. Only two generated image-cache filenames refresh; their bytes are
unchanged. Failures and traces are retained. The comparison establishes the
specified navigation regression; it does not establish a vendor root cause.
The Main boundary uses the actual route segments so a native conversation URL
rename does not reset an active first-send transaction.

## Candidate 5 verification (historical)

Frozen candidate: `996YQ1y_sQpfHWDQFPH6n`.

The complete twenty-case suite passes in one run: **20/20**, zero retries
(1.4 minutes). This includes the held-module scenario and corrected finite-quota
semantics. The run records 370 GETs to the owned fixture, 15 locally declined
quote reads, zero mutation attempts, zero unexpected outside origins and zero
page errors. All 49 existing analytics-script attempts were blocked.

The coordinator's fresh original browser matrix also passes **96/96**, including
the extended **10/10 foundation cases** and **30/30 research cases**. The
foundation run verifies the complete active row at both short-laptop heights
and after returning to Dashboard, with the document staying at scrollY 0. React
26/26, Node 67/67 and copied-workspace 5/5 pass in the same final verification.

The following absolute CSS-pixel measurements use this suite's English owned
fixture at normal text scale. The independent visual audit supplies the matched
same-scenario screenshot comparison.

| Functional-fixture element and viewport | Candidate 5 measurement |
| --- | --- |
| Phone first research run link, top | 378px |
| Phone selected-report h2, top | 166px |
| Phone report article `#report-detail`, top | 145px |
| Desktop 1440×1000 report article width | 852px |
| Phone populated Agent h1, top | 81px |
| Phone chat textarea, top–bottom | 593–657px |
| Phone Send button, bottom | 755px within the 844px viewport |

## Candidate 4 verification (historical)

Frozen candidate: `xxkKmnp0tHoyC0q8uMtGE`.

- Original nine-scenario suite: **18/18 passed**, zero retries (53.5 seconds).
- Added held-module scenario: **2/2 passed**, zero retries (11.4 seconds).
- Strict targeted TypeScript checking and twenty-test collection pass.
- Original thirty-case research suite: **30/30 passed**, zero retries (52.0
  seconds), after correcting the visible-error scope for desktop and phone.

The detail-loading boundary received two controlled comparisons using identical
tests, fixtures, desktop dimensions, budgets and zero retries:

| Check | Preserved candidate 3 | Candidate 4 |
| --- | --- | --- |
| Actual list-to-detail click, 20 independent repetitions | 19 passed, 1 retained URL/commit failure | 20 passed |
| Actual module held during navigation, desktop English and phone Chinese | Both retained failures: URL remained the list | Both passed: URL/loading/search while held, then full body/evidence |

The repeated comparison is diagnostic evidence, not a CI retry loop. The
ordinary research scenario remains unchanged. Old failures and traces are
retained. Runtime manifests record generated image/route-cache changes
separately; pre-existing application code and symlink targets remain unchanged.

These checks establish the specified workflows and geometry. Independent actual
screen review remains the product-quality gate alongside the engineering tests.

With web dependencies available through `NODE_PATH`, run from `apps/web`:

```sh
pnpm exec playwright test --config playwright.worldclass.config.ts --output test-results/worldclass
```

CI collects the resulting screenshots, geometry and read-only request evidence.
