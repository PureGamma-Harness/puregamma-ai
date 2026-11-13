# PureGamma MVP workflow upgrade

This upgrade works from the existing PureGamma repository and its current
release boundaries. The goal is a usable research SaaS: a visitor can complete
setup, start and stop an Agent request, inspect research evidence and reports,
understand unavailable financial data, and recover from a failed operation.
Optional providers and trading permissions remain explicit server capabilities.

## Coordination prompt

Act as the release engineer for the current repository. Inventory actual routes
and consumers before selecting work. Give each agent an isolated checkout and
explicit file ownership. Each domain must write its implementation prompt,
repository evidence, acceptance criteria, modern-method choices and evaluation
before changing code. Implement the observed workflow gaps, self-review the
result, then require another agent to review the frozen candidate. Resolve
review findings before publication.

Favor native accessible browser controls, explicit asynchronous ownership,
structured bounded context, consented retrieval and conditional state changes
over a replacement framework. Verify real browser behavior and database
interleavings; labels, mock data or a successful API response alone do not prove
a usable product. Keep source audits, test discovery, isolated component probes,
whole-route health and mutation journeys as separate evidence.

## Domain briefs

| Domain | Prompt, evidence and acceptance | Implemented workflow |
| --- | --- | --- |
| Product inventory | [Route audit](route-audit.md) | All 90 page files accounted for: 54 localized pages, 33 aliases, root redirect, two legal pages; default gates recorded |
| Design and navigation | [UI foundation](ui-foundation.md) | Native mobile navigation, focus/skip/scroll recovery, shared controls, appearance synchronization, visible static/reduced-motion content and dashboard workflows |
| Product experience | [Research workspace](worldclass-experience.md) | Shared visual hierarchy, exact Agent drafts, outcome-first research, mobile report reading, native page search and independently reviewed financial states |
| Authentication and setup | [Auth and onboarding](auth-onboarding.md) | Persistent labels, local navigation validation, CAPTCHA recovery, retained research choices, storage-denial support, save retry and segment feedback |
| Research workspace | [Research UI](ui-research.md) | Reliable history/actions, stoppable setup/stream, readable evidence and artifacts, report navigation, explicit partial failures and private-memory controls |
| Business operations | [Operations UI](ui-operations.md) | Confirmed destructive operations, unknown-versus-zero financial states, validated inputs, reliable filters and honest checkout messaging |
| Agent retrieval | [RAG and context](rag-orchestration.md) | Consented structured memory, bounded lexical ranking, tenant idempotency, valid evidence JSON and owned current-turn history |
| Research execution | [Harness](harness-quality.md) | Full request identity, stage claims, cancel/deadline handling, atomic terminal artifacts, owned immutable snapshots and numeric citation integrity |
| Native tool evidence | [Harness tool output](harness-tool-output.md) | Real SDK evidence projection, actual sandbox state, provenance/health priority and explicit bounded omissions |
| Chart reliability | [Charts](chart-reliability.md) | Announced loading/error, retry, per-attempt canvas ownership and bounded preview of actual supplied values |
| Provider status | [Data sources](data-source-status.md) | Preserve server availability and distinguish empty, unauthorized and failed reads without enabling a provider |
| Static first paint | [SSR and hydration](hydration-recovery.md) | Real setup headings, progress and controls directly inside server-rendered main; preserve page-owned loading and error recovery |
| Shared runtime | [Hydration boundary](runtime-hydration.md), [browser validation](runtime-validation.md), [independent review](runtime-browser-review.md), [streamed workspace](streamed-workspace-locators.md) | Isolate delayed page modules from navigation while retaining one main landmark and real static setup content; scope browser interactions to their accessible workspace |
| Harness runtimes | [Node compatibility](harness-node-runtime.md) | Preserve compilation and policy checks across Node 22/24 with the native configuration loader and both CI jobs |
| Site dependencies | [Scoped hardening](site-dependency-hardening.md) | Patch three affected tool consumers, verify actual loaders/fonts/globs and enforce a moderate-severity audit gate |
| Route recovery | [Scoped recovery](route-recovery.md) | Renderable admin errors, daily settings recovery with Next control signals preserved, single API/advisory main landmarks |
| Legacy navigation | [Query preservation](legacy-query-preservation.md) | Preserve repeated, empty and Unicode query values across all locale aliases without changing API handling or release gates |
| Layout containment | [Route geometry](route-geometry.md) | Contain secretary artwork and wrap long backtest errors at desktop/mobile widths |
| Full-route quality | [Route quality](route-quality.md) | Production route discovery, English/Chinese, desktop/390px, legacy redirects, SSR sessions and separate full/default-launch gates |

The small integration follow-up to `EvidenceGraph` renders a noninteractive
group when no selection callback exists. It preserves button semantics only
when there is an actual action, avoiding dead keyboard stops in research detail.

## Validation and release boundary

The runtime-security workflow builds the full-product test configuration and
runs focused product contracts, real React/browser state probes, authentication,
navigation, research and financial-operation journeys, then whole-route health.
A separate job builds with the unchanged default launch policy and tests its
redirect gates. Test configuration is not a production flag change.

The route-health suite has 238 discovered cases per mode, including eight
populated layout checks and two transport-isolation cases added after the
original 228-case audit. Full mode has
216 canonical visits, 14 auxiliary cases and eight geometry cases. Default
launch mode has 148 canonical browser visits, 68 release-gate checks and the
same auxiliary/geometry cases. The original focused workflow discovery totals 96 cases:
14 upgrade, 10 foundation, 20 authentication, 30 research and 22 operations.
The product-experience suite adds 20 cases (10 scenarios in desktop and phone
projects). Four further authentication/research cases protect delayed Dashboard
navigation and first-message continuity across a native conversation URL rename.
Current focused discovery totals 120: 14 upgrade, 10 foundation, 22
authentication, 32 research, 22 operations and 20 product-experience checks.
Their native delayed-module, account-state and page-finder assertions supplement
the original business and error checks; they do not replace them.
Actual execution results remain separate from discovery. A scoped unavailable
state is distinct from a working external provider.

Before this product-experience round, the frozen runtime follow-up passed local
full routes 238/238. Its fresh
[Web CI](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43461686491)
passed 96 focused journeys, 59 Node checks, five separately copied-runtime
checks, 26 real React checks and both full/default-launch route modes 238/238
on attempt 1. Fresh
[API CI](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43461686233)
passed 1525 tests plus eight Relay checks, with four existing expected failures
and one opt-in load skip. Independent review verified all three final
test/fixture blobs before [PR #58](https://github.com/PureGamma-Harness/puregamma-ai/pull/58)
merged as `38b5eea3d506a8ca992a95b714605028d29a57bf`. PR #56's rendering/layout
repair, bounded Chromium 149/156 repetitions, visual checks and historical
failures are recorded separately in the runtime briefs. The independent
default-push [Web](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43463254218)
and [API](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43463254173)
checks are separate executions of the merged runtime.

[PR #59](https://github.com/PureGamma-Harness/puregamma-ai/pull/59) separately
patches three site-tool advisories. Fresh
[Site CI](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43459604381)
passed both Node 22/24 jobs on attempt 1: clean install, zero audit findings,
type/lint/build, 19 full-tree tests and a separate production-only install with
one real image-runtime test. Independent review rejected an intermediate lock
that omitted native production dependencies; the approved version preserves
their original metadata and rejects host-global library fallbacks. The checked
Web/Harness dependency snapshots and current API environment also audited clean.
GitHub alert details return 403 for the current integration, so these audits do
not establish closure of specific GitHub alert records.
The separate [default-branch Site run](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43460124436)
also passed both jobs on attempt 1; its merge tree matches the approved test tree.

The first frozen full-mode audit ran all 228 cases and exposed alias query loss,
admin error rendering, missing daily settings recovery, duplicate main landmarks
and two layout overflows. Those findings have explicit repairs and independent
reviews. A Chinese embedded-docs shell needs a dedicated semantic check instead
of an arbitrary English-oriented text-length threshold. Native navigation
acceptance also exposed recurrent hydration errors in onboarding and Options
history. Removing the newly added locale-wide loading boundary restored direct
server rendering of setup content, but later ordinary and hosted runs still
reproduced the hydration error. The follow-up captured the shared main host and
its already-entered first-child cursor after an existing failure. A controlled
delayed page-module response also demonstrated blocked mobile navigation.
The revised structure keeps a permanent main and isolates page children inside
their own hydration boundary. Its server fallback retains real content, while
client recovery uses local loading feedback. Unchanged inert-HTML checks still
require actual headings, progress and controls before scripts run. The new
delayed-module regression requires shared controls to work before the original
feature response is released. Original failures, diagnostic evidence, ordinary
acceptance and fresh hosted CI remain distinct; no retry or filtered error
assertion constitutes the repair.

Backend source was frozen for a full 1523-pass regression with four pre-existing
expected failures and one opt-in load skip. A later one-line citation-parser
correction and two cases passed the 66-case related selection and independent
review; final integrated CI covers the final source. Real local PostgreSQL
probes also exercise competing snapshot inserts, duplicate workers and cancel
during a synthetic provider call. No production deployment, real provider charge,
live order, payment, public tunnel or notification is part of this upgrade.
