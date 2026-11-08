# Agent retrieval and context engineering MVP

## Repository context and execution prompt

Act as the maintainer of PureGamma's existing research Agent and consented user
memory. Improve the actual retrieval-to-model path without replacing the model
provider, adding a vector database, changing client response contracts, enabling
features, or granting tools additional authority.

Read `apps/api/services/agent_service.py`, `packages/memory/service.py`, the
`UserMemory`/`MemoryProposal` models, prompt templates and existing Agent/memory
tests before editing. The system already has tenant-scoped memory, scope opt-outs,
expiry, source-bearing tool results, an Evidence Pack, versioned prompts and SSE.
Preserve those contracts and the default-disabled LIVE boundary.

Confirmed gaps at base `48fe315`:

1. Agent context reads `memory.content`, although `UserMemory` only exposes
   `content_json`. The best-effort exception handler hides the resulting loss of
   all consented personalization.
2. Memory retrieval caps only positive upper limits; a negative SQL limit can
   select every eligible record. Ranking ignores the current question.
3. The Agent slices a serialized Evidence Pack at 24,000 characters. This can
   leave invalid JSON and silently remove trailing portfolio context.
4. Explicit proposal idempotency keys are looked up globally, allowing a service
   caller's key collision to return another tenant's proposal.

Implement these bounded context-engineering patterns:

- Apply ownership, active status, TTL and scope filters before a bounded
  candidate pool. Use deterministic lexical relevance to the current question
  within that pool; retain the existing salience/recency order as the tie-breaker.
  This is a transparent lexical retriever, not a claim of semantic search.
- Render only the real structured memory field, redact secrets, bound the
  resulting context, and label it as untrusted personalization data. It must
  never become market evidence, instructions, permissions or trading approval.
- Pack complete JSON evidence records under a fixed character budget, preserving
  quality/requirements and portfolio availability. Explicitly describe omissions
  instead of silently clipping a JSON fragment.
- Namespace new explicit idempotency keys by tenant while allowing owned legacy
  retries. Never return another tenant's proposal. Do not migrate persisted data.

## Acceptance and offline evaluations

- A real consented memory reaches the captured model context without an injection
  exception; disabled service, absent consent, disabled scopes, expiry and another
  user's memory remain excluded.
- Query-relevant eligible memories precede irrelevant high-salience memories
  within the bounded candidate pool. Zero/negative limits return no records;
  positive limits never exceed 32.
- Rendered memory/evidence contexts parse as JSON, stay within their budgets and
  explicitly report omitted records. A huge first result cannot corrupt the
  context or fabricate portfolio availability. Evidence quality reflects what
  remains visible to the model.
- Same-tenant retries are idempotent, same explicit keys across tenants are
  isolated, and owned pre-upgrade explicit keys still retry successfully.
- Existing Agent streaming, attachment, metering, prompt-registry and memory
  security suites pass with synthetic data and no external provider calls.

## Implementation, validation and self-review

Implemented in `packages/agents/context.py`, `packages/memory/service.py` and the
existing Agent service. Evidence-policy prompt version is now **1.3.0**. Retrieved
evidence and memory use explicitly labeled user-role data messages rather than
high-priority system messages; the actual current user question stays last.
Source table indices match the persisted/SSE citation indices. No API field or
database schema changed. New explicit proposal keys use a tenant prefix plus a
SHA-256 digest; owned legacy keys remain retryable without rewriting old rows.

The initial nine offline regression cases produced **4 failed / 5 passed** on the
original source (consented memory loss, negative limit, tenant key collision and
the missing query-aware retrieval capability). After implementation those same
nine passed. The expanded suite has **23 new cases**; together with existing
memory, Agent planning, attachments, online fallback, billing and answer API
regressions, **98 passed**, zero failures/errors/skips. Evidence is retained in
`/workspace/scratch/round6-agent-context-red.xml` and
`/workspace/scratch/round6-agent-related-final.xml` with corresponding logs.

```sh
/workspace/puregamma-ai/.venv/bin/python -m pytest \
  tests/unit/test_agent_context_mvp.py \
  tests/security/test_memory_service.py tests/unit/test_agent_runtime.py \
  tests/unit/test_chat_workspace.py tests/unit/test_agent_online_research.py \
  tests/unit/test_agent_metering.py tests/integration/test_agent_answer_api.py \
  --basetemp=/workspace/scratch/pytest-round6-agent-related-final \
  --junitxml=/workspace/scratch/round6-agent-related-final.xml
```

Self-review checked that scope/ownership/TTL filters execute before ranking; no
raw query is written to audit metadata; only selected memories are marked used;
rendering does not modify stored memory or evidence; omitted records change
`context_quality` instead of inheriting a false sufficient result; and oversized
source metadata never renumbers a later citation. A captured real Agent stream
checks valid bounded JSON, completed settlement and the final question ordering
using a synthetic model provider and stored tool result. No external model,
financial transaction, deployment or feature-flag change was performed.

### Modern-method references and deliberate limits

Reviewed primary guidance on 2026-11-08:

- [OpenAI: Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)
  advises keeping untrusted variables out of high-priority messages, passing them
  through user messages, and constraining inter-node data with structured fields.
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
  discusses relevance under limited attention budgets, structured memory and
  preserving important context while omitting redundant tool output.

These principles are applied to the existing provider-independent runtime; no
vendor-specific Agent platform or new vector database is required. Downloaded
reference excerpts/statuses are in
`/workspace/scratch/round6-agent-context-primary-sources.json`.

Independent review is performed by another agent before root publishes or merges.
Lexical ranking searches at most 128 eligible salience/recency candidates and
returns at most 32, so it does not promise full-corpus semantic recall. JSON
budgets are character budgets rather than token estimates or total-process
memory limits; fixed message headers are additional. Evidence records are kept
whole or explicitly omitted, so a single oversized result may be absent despite
its retrieval succeeding. Portfolio/source metadata each reserve at most one
third of the JSON budget. Prompt placement and content are tested offline; this
does not claim a measured live-model quality improvement or complete prevention
of prompt injection. Existing consent, entitlements, tool gates and deterministic
trading policies remain the authority boundaries.
