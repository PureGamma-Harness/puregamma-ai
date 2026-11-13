# Research and Reports product experience

## Repository evidence and execution prompt

Baseline: `aff416f3d26a9ad78598d451076bd0b9347e95fd`.
The existing research and report workflows already own requests, preserve failed
drafts and confirmed snapshots, expose source limitations, and support mobile
report focus. This pass changes their presentation and reading order.

The Research page currently wraps its console with a second large heading that
always says research is running, even when the real active count is zero. Its
phone capture puts the first task near y590. Reports starts its archive/reader
around y405 at 1280px, with a fixed 340px archive and repeated metadata. Completed
research puts six process stages and an evidence graph ahead of the result.

Act as the product designer and frontend engineer for PureGamma's evidence-first
financial research workspace. Give each destination one factual page heading,
one clear primary action and an immediately useful working area. Make completed
research outcome-led, while keeping active progress prominent. Give saved reports
a compact archive, a comfortably measured reading surface and unmistakable
selection. Use the shared semantic tokens, restrained type and spacing, and
native disclosure for secondary controls. Do not decorate unavailable results or
invent sources, timestamps, activity or execution authority.

Preserve API calls, request ownership, polling/SSE, permission and credit rules,
failed-question retention, stale snapshot recovery, locale/query contracts,
mobile focus, source links and complete Markdown artifacts. Keep the original
business/error assertions and time budgets. Another agent must review the source
and real desktop/mobile screenshots before publication.

## Acceptance

1. Research has one workspace h1 and describes actual loaded/active counts.
   At 390×844 the primary control and first loaded task should be visible without
   stacked introductions; target the first task's top at or before y400.
2. Reports exposes archive and selected reading context early. Its desktop
   archive is no wider than 260px and the reader receives at least 640px at
   1280px where the shared shell's geometry permits. At 390×844 a valid report deep link places its selected heading no lower than
   y300. Mobile selection reveals and focuses that heading; Back returns to the
   archive and search focus. Desktop keeps both panes visible.
3. Completed research places the actual summary and full artifact before the
   process timeline. Process details remain keyboard-accessible. Active tasks
   still put progress first. Partial failures and limitations remain visible.
4. Existing create/retry/filter/deep-link/read workflows and original page-error
   checks pass. Unknown sources, stale reports and unavailable archives remain
   distinct, with the existing send restrictions intact.
5. The integrated product is inspected at phone and desktop sizes, in light and
   dark themes. First-viewport composition, readable prose, focus and overflow
   are product acceptance criteria separate from engineering CI.

## Ownership and validation

This change owns Research list/detail and Reports rendering plus the report
locale copy. Shared CSS, navigation, primitives, Agent and Dashboard belong to
other implementation owners. No new dependency or production service is needed.
The coordinator owns the integrated build, screenshots, independent review and
merge. Actual verification results are recorded after the candidate is frozen.


## Implemented behavior and self-review

Research now has the sole page heading `Research` / `研究任务`, replacing the
unconditional outer `Research is running.` and the duplicate motivational
heading. The existing `New research run` / `新建研究任务`, create form, search,
filter and retry names remain. Its total and loaded active count use the original
responses. Missing source/evidence counts say they were not recorded rather than
showing an invented zero. The request, ownership and mutation code is unchanged.

Completed, degraded and stopped run details lead with the original summary and
full artifact. Their process timeline is a native disclosure; active and unknown
statuses keep progress first. Source URLs, excerpts, verification labels,
limitations, last confirmed snapshots and original retry alerts remain. Artifact
loading is explicit and uses the same cancellation guard as the original
request. Markdown content is unchanged, with its headings nested under the page
and section headings using `headingBaseLevel={3}`.

Reports uses a 248px desktop archive and a flexible reader. Its page name is now
`Reports` / `研究报告` instead of `Research Desk` / `研究台`. Shorter archive rows
keep real title, asset/type, date, selection and freshness; the reader retains
full content, full creation timestamp, language, source state, stale warning and
fresh-only delivery controls. Generation moved into the native `Generate brief`
/ `生成简报` disclosure (visible English label `New brief`), retaining the
original language controls and ten-credit price. No generation API changed.

Below 1024px, the report workflow has one visible pane: a normal `/reports`
entry starts with the archive; a valid `?report=` starts with that report's
reader. Selecting a report keeps the original URL update and heading focus,
then reveals the reader. `Back to archive` / `返回归档` reveals the archive and
restores search focus without clearing the selection, query or type filter.
Desktop keeps archive-first DOM order with both panes visible. Hiding the
inactive mobile pane avoids keyboard traversal through an offscreen archive.
A filter with no results always leaves the archive reachable. Existing mobile
end-to-end flows must deliberately return to the archive before changing a
filter or choosing another report; all business, content, query and error
assertions are retained by the coordinator.

## Local verification

Targeted TypeScript checking passed with Node 22.23.4 against the five changed
route/component files and their imports. Targeted Next lint passed with no
warnings or errors. `git diff --check` passed. Source comparison against the
baseline confirmed Research's state/request/handler block is identical;
Reports' selection/filter/query/mobile-focus block is identical after excluding
the added pane presentation state; detail async ownership is identical after
excluding the cancel-guarded artifact-loading presentation state. No test, API,
production service or dependency was changed by this owner.

Local evidence: `/workspace/scratch/worldclass-research-reports-typecheck.log`,
`/workspace/scratch/worldclass-research-reports-lint.log`, and
`/workspace/scratch/worldclass-research-reports-mechanical-review.json`.
Integrated production build, original end-to-end assertions, real screenshots,
measured geometry and independent product acceptance are pending coordinator
verification; the local static checks do not stand in for those gates.
