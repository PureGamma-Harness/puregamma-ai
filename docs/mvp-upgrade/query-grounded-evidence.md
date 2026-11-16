# Query-grounded evidence selection

## Task and original failure

Improve one existing research task: make evidence for explicitly mentioned
assets available to the research worker before its twelve-item evidence cap.
Baseline: `3bd7d3d9f800e3c005b5c20547de2683371ce6eb`.

The actual builder could observe thirteen eligible quotes, including AAPL or
BTC, while Harness selected twelve unrelated, higher-confidence events. The
target event existed and was included in the current observation IDs. A
comparison over twelve BTC documents and one ETH document similarly lost ETH.
The selection query never read the user's question and applied LIMIT first.

Here quote confidence represents freshness and news confidence derives from a
document score. Neither measures relevance to the current question. Sorting
only the already-truncated twelve items cannot recover an excluded thirteenth.

## Execution contract

- Preserve the actual validated research prompt separately from the display
  title, including internal newlines. Only trusted prompt provenance may drive
  selection. Existing combined title/question records retain their quality-only
  behavior instead of guessing which lines the user originally submitted.
- Recognize a conservative, versioned set of explicit asset mentions. Use
  structured event assets for attribution, with explicit symbol syntax and
  defined aliases. Ordinary words such as hype or spy must not become assets
  merely because a global lexicon assigns them a high confidence score.
- Apply selection before the cap. First cover each available mentioned asset
  within capacity; a shared event may cover multiple assets without appearing
  twice. Then select remaining matching evidence and quality-ordered background.
- Preserve current observation membership, allowed source types, active state,
  owner checks, immutable prior snapshots, continuous final citation indexes and
  the twelve-item limit. Unknown and broad questions retain the old order.
- Freeze stable source asset attribution with the evidence. Keep question-specific
  policy and coverage metadata on the run/artifact, so two different questions
  can still reuse an identical ordered evidence payload. Different actual
  priorities and citation indexes legitimately produce a different bundle hash.
- Give the model the actual question, bounded asset labels and an honest coverage
  summary. Background evidence does not establish coverage of every mentioned
  asset. Add no model or provider calls; preserve prompt and output budgets.

Internal run metadata retains the complete bounded-by-input mention list for
selected-coverage auditing. Model context receives only bounded summaries and
explicit omission counts. Frozen selected assets and run metadata support
inspection of the selected coverage; they do not freeze every rejected
candidate's historical quality/order or constitute a complete ranking ledger.

## Evaluation and independent review

Inputs start at constructed raw quotes or normalized source documents and pass
through the real research builder and selector. Expected asset attribution is
fixed before reading the candidate implementation. Baseline and candidate use
their own real create-run constructors with separate equal-budget users and the
same event pool; candidate-only private input metadata is never fabricated by
the evaluation driver.

The independent evaluation separates explicit-target coverage from constraint
preservation. Its target denominator is annotated from eligible observed data,
not from whatever targets a candidate happens to recognize. Zero-target guards
do not count as perfect target retrieval. Counterfactuals compare the old
selector, a post-limit reorder and a pre-limit target-first reorder without
multi-asset coverage, explaining which mechanism repairs the original failures.

Separate review covers title/prompt conflict, legacy and retry provenance,
ordinary words and symbol boundaries, multi-asset duplication, source/active/
observation exclusions, cancellation before the running claim, immutable bundle
reuse, bounded model context and unchanged billing behavior. Raw records,
versioned inputs, failures, judgments and reproduction commands are retained.

The frozen evaluation contains 21 constructed scenarios: ten explicit-target
tasks and eleven compatibility/boundary cases. On the ten target tasks:

| Selector | Mean available-asset coverage at 12 |
| --- | --- |
| Original quality-first cap | 0.10 |
| Reorder after the original cap | 0.10 |
| Target-first before cap, without multi-asset coverage | 0.90 |
| This policy, with capacity-aware asset coverage | 1.00 |

The annotated covered-asset count changes from 2/13 to 13/13 in this fixed
corpus. All eleven compatibility cases retain their required constraints. These
are deterministic case results, not population estimates or model-answer
accuracy. Non-target-tagged background remains in the selected set.

Paired full-worker replays use actual constructors, builders, snapshots,
artifacts and credit records, replacing only external providers and the gateway.
They observe one gateway dispatch per new execution and unchanged dispatch/
settlement on terminal replay. Input-character counts grow because of asset
labels and coverage notes; equal constructed token usage and fixture credits
do not establish equal production token cost or latency.

## Recorded provenance and budgets

New runs store validated question/title values and their origin in private
`usage_json.research_input`. Invalid shapes fall back conservatively; validation
preserves names actually produced by the existing trim-then-truncate constructor.
New retries retain the original question, while reconstructed historical retries
are marked as such and keep quality-only selection.

`usage_json.evidence_selection` and the artifact validation record retain policy
and selected-coverage metadata. `eligible_count` is unknown (`null`) on the
original one-query limit path; targeted selection records the count observed at
the lightweight metadata read. Selected/covered/missing values are recalculated
from final eligible rows, including after a concurrent withdrawal or asset edit.
Run-specific data is saved only after the running-stage claim succeeds.

Model coverage notes are capped at 600 characters, showing at most three values
per list and explicit omissions. Source labels show at most two 32-character
assets; excerpts retain the 300-character item and 8,000-character aggregate
bounds, and the output cap remains 1,200 tokens. Full source assets remain in
the frozen evidence for audit; only their bounded labels enter the model.

## Limits of the result

This is deterministic lexical asset coverage within the candidates already
observed by existing builders. The news builder itself still selects at most
fifty documents before Harness selection. This change does not establish
whole-corpus recall or add a vector/semantic retrieval service.

Natural-language exclusion, negation and exclusive-only intent are not parsed.
Background records remain eligible filler, so the result is not an exclusive
asset filter or a guarantee of perfect precision. A mention is not proof of
user intent; an asset tag is not proof that a source entails a financial claim.

The fixtures do not measure real-user success, live-model answer quality,
production latency or investment suitability. Reference checking retains its
[separate integrity contract](research-evidence-integrity.md), and does not
provide factual verification. Old frozen artifacts are not rewritten.

## Repeatable repository checks

From the repository root with the existing API requirements installed:

```sh
python -m pytest -q tests/unit/test_harness_query_retrieval.py tests/unit/test_harness_observed_evidence.py tests/security/test_harness_lifecycle_integrity.py tests/security/test_harness_contract.py
```

The final release also requires the unchanged full backend workflow on the
reviewed commit and its actual merge commit. No web source or browser-test
configuration changes are required for this server-side selection policy.
