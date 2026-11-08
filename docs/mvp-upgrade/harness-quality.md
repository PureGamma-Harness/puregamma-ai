# Harness research MVP: execution prompt and acceptance

## Repository evidence and scope

The Core V2 architecture keeps capabilities behind Cordis service definitions and migration providers. The existing Python research seam (`apps/api/services/harness_run_service.py`) remains the active implementation until retirement gates pass; this change improves that existing boundary and does not create another host or bypass a plugin service.

At base `48fe315`, create identity hashes only the truncated combined goal, omitting requested evidence sources and skill. `transition_run` uses a conditional status UPDATE, but its losing path calls `Session.get`, which can return the stale identity-map instance. The worker ignores the conditional-update result before evidence gathering and after provider completion. Its citation check considers any single known marker sufficient even when unknown markers are also present. These are hypotheses to reproduce with offline tests before changing behavior.

## Execution prompt

Act as the Harness lifecycle and evidence engineer. Preserve user ownership, feature gates, credit reservations, terminal-state immutability and Core V2 migration boundaries. Upgrade the existing research lifecycle using an explicit request identity, compare-and-set execution claims, authoritative refresh at external-operation boundaries and citation-set integrity. Source text remains evidence, not authority. Avoid a new orchestration framework or vector dependency: the existing frozen evidence bundle and versioned input hash are sufficient for this MVP.

1. Reproduce incorrect reuse across evidence scopes, stale-worker execution, cancellation during evidence/provider work, deadline expiry and invalid citation markers against the unchanged base.
2. Include canonical effective source scope and declared skill in deterministic request identity; retain equivalent-request deduplication and compatible legacy request reuse. Preserve the full accepted prompt.
3. Continue only after acquiring each state transition. A losing worker must observe authoritative state and must not produce a second artifact, invoke a new provider call or settle/refund somebody else's terminal run.
4. Treat already-dispatched synchronous provider work as in flight: cancellation cannot interrupt that external operation, but its late result must be discarded and must not resurrect, settle or publish a canceled/timed-out run.
5. Validate that every numeric research citation belongs to the frozen evidence set. Invalid or absent references degrade the output and record deterministic validation details. A matching marker establishes reference integrity only, not factual entailment or human verification.
6. Exercise real independent SQLAlchemy sessions for stale identity-map and interleaving behavior. Stub only external evidence/provider calls, and keep all tests offline.

## Acceptance and evaluation

- Different evidence scopes produce different run identities; source order, duplicates and empty/all equivalence do not create unnecessary paid runs.
- Equivalent legacy rows can be reused only after their stored goal, skill and source scope are checked.
- The maximum accepted request retains its tail; retry is an idempotent new attempt per owned parent run, including maximum-length names.
- A stale CAS loser refreshes status/timestamps and writes no audit row. Only the worker that claims preparation gathers evidence.
- Cancellation observed during evidence work prevents dispatch; cancellation/timeout during provider work prevents artifacts and additional settlement. Credit refunds remain idempotent.
- Completion and artifact persistence share one final transaction; terminal publication must not precede its artifact.
- Known citations remain useful; unknown, zero and malformed numeric markers cannot produce a verified result. The server records exact referenced/unknown indexes.
- Existing Harness foundation/API, ownership and billing suites continue to pass. No real provider, transaction, notification, deployment or live gate is used.

## Boundaries

No claim is made that a matching citation proves a model's statement true. Provider cancellation is cooperative at stage boundaries; synchronous upstream work already dispatched is not interruptible here. PostgreSQL row locking remains the production concurrency mechanism; deterministic local sessions verify the status-CAS contract without claiming a new distributed execution lease or crash recovery protocol.

The current model-facing TypeScript research tools render only document timestamps and metadata in direct tool content. The pinned `dsh-tools` source confirms structured `value` is kept separately from rendered `content`; improving that projection is a separate follow-up, not a prerequisite for the lifecycle repair.

## Implementation and self-review

Implemented in the active research service plus `packages/harness/state_machine.py` and the dependency-free `packages/harness/citations.py`. No database migration or dependency change is required.

The final byte-identical 19-case replay file against unchanged production source produced **15 failures and 4 passes**, with zero errors/skips. After implementation, the same replay plus existing foundation/API contracts produced **57 passed**, zero failures/errors/skips. Evidence: `/workspace/scratch/round6-harness-red-final.xml`, `/workspace/scratch/round6-harness-green.xml` and their matching `.log` files.

```sh
/workspace/puregamma-ai/.venv/bin/python -m pytest -q \
  tests/security/test_harness_lifecycle_integrity.py \
  tests/security/test_harness_foundation.py \
  tests/security/test_harness_contract.py \
  --basetemp=/workspace/scratch/pytest-round6-harness-green \
  --junitxml=/workspace/scratch/round6-harness-green.xml
```

Self-review checked: equivalent legacy rows are inspected rather than blindly reused; input source order does not change a reservation; the accepted 4000-character prompt is never cut by the name; retry identity is anchored to the already ownership-checked parent; every worker phase gates side effects on its winning transition; cancellation losing to completion never refunds; late provider output is discarded; final-state and artifact publication share a transaction; citation diagnostics are deterministic and never manufacture source rows. Error summaries exposed to clients are fixed category messages, not raw provider exceptions.

The existing best-effort settlement helper remains unchanged: financial settlement attempts are idempotent, but this change does not introduce a billing recovery scheduler or claim every external failure is atomically recoverable. Root owns the full integrated regression and an independent reviewer checks this patch before merge.
