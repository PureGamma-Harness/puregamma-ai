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
| Authentication and setup | [Auth and onboarding](auth-onboarding.md) | Persistent labels, local navigation validation, CAPTCHA recovery, retained research choices, storage-denial support, save retry and segment feedback |
| Research workspace | [Research UI](ui-research.md) | Reliable history/actions, stoppable setup/stream, readable evidence and artifacts, report navigation, explicit partial failures and private-memory controls |
| Business operations | [Operations UI](ui-operations.md) | Confirmed destructive operations, unknown-versus-zero financial states, validated inputs, reliable filters and honest checkout messaging |
| Agent retrieval | [RAG and context](rag-orchestration.md) | Consented structured memory, bounded lexical ranking, tenant idempotency, valid evidence JSON and owned current-turn history |
| Research execution | [Harness](harness-quality.md) | Full request identity, stage claims, cancel/deadline handling, atomic terminal artifacts, owned immutable snapshots and numeric citation integrity |
| Native tool evidence | [Harness tool output](harness-tool-output.md) | Real SDK evidence projection, actual sandbox state, provenance/health priority and explicit bounded omissions |
| Chart reliability | [Charts](chart-reliability.md) | Announced loading/error, retry, per-attempt canvas ownership and bounded preview of actual supplied values |
| Provider status | [Data sources](data-source-status.md) | Preserve server availability and distinguish empty, unauthorized and failed reads without enabling a provider |
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

The route-health suite has 228 discovered cases per mode; the full mode includes
216 canonical visits across both locales and viewports. Actual pass counts and
any fixture corrections are recorded only after the final integrated artifacts
run. A scoped unavailable state is distinct from a working external provider.

The first frozen full-mode audit ran all 228 cases and exposed alias query loss,
admin error rendering, missing daily settings recovery, duplicate main landmarks
and two layout overflows. Those findings have explicit repairs and independent
reviews. A Chinese embedded-docs shell needs a dedicated semantic check instead
of an arbitrary English-oriented text-length threshold. The original auth
sequence also recorded one initial-load hydration error; the unmodified complete
16-case sequence subsequently passed and bounded diagnostic attempts did not
reproduce it. Final acceptance uses fresh artifacts, with the initial evidence
retained instead of labeling that transient error as a proven code fix.

Backend source was frozen for a full 1523-pass regression with four pre-existing
expected failures and one opt-in load skip. A later one-line citation-parser
correction and two cases passed the 66-case related selection and independent
review; final integrated CI covers the final source. Real local PostgreSQL
probes also exercise competing snapshot inserts, duplicate workers and cancel
during a synthetic provider call. No production deployment, real provider charge,
live order, payment, public tunnel or notification is part of this upgrade.
