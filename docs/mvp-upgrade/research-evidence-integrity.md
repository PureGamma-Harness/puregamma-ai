# Research evidence and completion integrity

## Task and evidence boundary

Improve one existing task: execute research, inspect its frozen sources and
artifact, distinguish complete from degraded output, and recover an interrupted
status connection. Baseline: `e882124c534d0a32a356ea4afd114a4d92983f35`.

The primary material is the actual research builder, event rows, worker state
machine, HTTP/SSE contract, browser responses and rendered product. Offline raw
quotes and provider responses in these tests are constructed fixtures, not real
user research or a benchmark of a live model's answer quality. No customer
recordings or production telemetry were available for this evaluation.

## Execution contracts

| Owner | Falsifiable claim | Original counterexample | Acceptance |
| --- | --- | --- | --- |
| Evidence collection | A currently observed source remains available to a second research run after event deduplication | Identical raw quote gives one item on the first gather and zero on the second; the event is still active | Real builder and gather reuse the observation; empty, failed, withdrawn or no-longer-selected source rows cannot silently supply historical evidence |
| Status transport and UI | A committed terminal state reaches the browser without inventing success | Worker commits degraded while SSE keeps reporting running; degraded completion plus GET failure renders Completed | Separate-session worker replay, real streamed HTTP, failed refresh, late-read and disconnect recovery preserve the authoritative state |
| Reference policy | Code literals cannot establish an authored research reference | An uncited answer followed by a code array `[1]` passes reference validation | Actual Markdown code regions are excluded, while unknown and malformed prose markers still fail closed |

Each implementation has a separate reviewer. Retained inputs are fixed before
evaluating the candidate. An independent rejection of the initial handwritten
Markdown scanner led to replacing its block/container parsing with maintained
CommonMark parsing rather than accumulating special-case regular expressions.

## Current observation is different from creation ownership

`build_research_events` globally deduplicates event fingerprints. An event keeps
its original `research_snapshot_id`; `source_counts_json` continues to count
newly created events. Each source's existing `health_json` now also records
`observed_event_ids` for candidates actually observed in this invocation.

Harness uses that explicit membership together with active status, requested
event types and the existing item limit. It does not search the historical
window when a provider is empty or unavailable. Old event ownership and frozen
EvidenceSnapshot contents remain unchanged. A stable ID tie-breaker keeps
citation ordering deterministic for otherwise equal rows.

This fixes reuse of observed evidence. It does not establish that a selected
source is relevant to every possible question, or that a summary entails a
financial conclusion. Question-conditioned ranking remains a separate evaluation
need; it is not claimed as an improvement in this change.

## State transport and truthful presentation

The SSE route releases the authentication/ownership read transaction before
streaming. Each poll uses a fresh, short read session and selects scalar fields
under the same run and owner filter. No session or checked-out connection is
held across a yield or sleep. Terminal events include explicit `status` and
`updated_at`, preserving existing event names and quality flags.

The browser applies explicit degraded/timed-out outcomes before refreshing
details. A failed detail read retains the known outcome and the reload warning.
Old GETs cannot restart a terminal run. Stream EOF returns the connection label
to polling. A legacy completion without sufficient quality information waits
for confirmation instead of inventing a successful outcome.

An aggregate terminal status is not a stage history. The timeline confirms
source/evidence or artifact stages only from actually loaded records and labels
unconfirmed stages explicitly. A generic degraded warning displays the recorded
reason; degraded output can result from reference failures as well as missing
evidence.

## Reference integrity is not factual verification

The HTTP `verification` field retains its compatibility values. Product text
states the scope: matching citation identifiers to recorded sources does not
establish that a claim is true. Source records do not receive a fact-check badge.

The `numeric-marker-prose-v2` policy checks numeric markers within each parsed
inline block or table cell, and never joins bracket fragments across blocks.
A maintained Markdown parser supplies those boundaries and native code spans.
The adapter checks inline Markdown syntax rather than concatenated AST text:
`[**1**]` cannot become `[1]`, and a Markdown-escaped opening bracket remains
literal. Even backslash pairs leave the following marker active. The block
parser can normalize line endings and table escapes; byte-for-byte document
identity is not claimed. Numeric markers in the web reader's escaped, visible
raw HTML remain subject to checking, using literal rather than Markdown-escape
semantics. Unknown and malformed markers within these scopes remain invalid.
Parser compatibility is compared with the web reader's actual GFM parsing and
rendering chain, including nested code containers, table cells, visible HTML,
footnote visibility, links and literal URL boundaries. These are tested contracts,
not a claim of complete parser equivalence for every possible Markdown document.
Existing frozen artifacts keep their original policy metadata.

A link written as `[1](url)` renders the label `1`, so it cannot supply an
`[n]` marker. `[[1]](url)` retains a visible `[1]` in its label and can supply
one. Link destinations, titles, reference suffixes and images do not supply
markers. Only used footnotes contribute their rendered content; an unused
definition cannot validate an otherwise uncited answer.

Neither a passing reference check nor an LLM judge is evidence of factual
entailment, completeness, investment suitability or human approval.

## Repeatable checks

Run from the repository root with the API requirements installed:

```sh
python -m pytest -q tests/unit/test_harness_observed_evidence.py tests/security/test_harness_stream_integrity.py tests/security/test_harness_citation_markdown.py
```

With the full-product web standalone build and its public/static assets prepared,
run from `apps/web`:

```sh
node --test tests/research-status-integrity.test.cjs
pnpm exec playwright test --config playwright.research-integrity.config.ts --output=test-results/research-integrity
```

The browser fixtures use a loopback HTTP server and real streamed responses.
They assert degraded/timeout semantics, immediate late-read resistance, source
wording, stage uncertainty and polling recovery on desktop and phone. The
workflow archives screenshots, request records and failure traces separately
as `research-integrity`; existing research, Agent and route checks remain.

File-backed SQLite with separate sessions demonstrates the committed-read and
connection-lifetime contracts. It does not measure PostgreSQL production
isolation, live-provider reliability, task success among real users, model
quality, production latency or cost. Those claims require their own observed
data and independent evaluation.
