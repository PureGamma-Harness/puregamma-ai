# Research workspace: execution brief and review

## Repository context

Base: `48fe3154fe56a0640d08148f0c7eaf7825af2da7`.

The product already has persistent Agent conversations and SSE events (`run.started`, `tool.*`, `citation`, `evidence.ready`, `message.completed`), attachment limits, approval gates and authoritative credit settlement in `apps/web/components/agent-chat.tsx` and `apps/web/lib/api.ts`. Harness research is a separate capability-gated workflow with create/list/detail/evidence/artifacts endpoints in `apps/api/routers/harness_runs.py`. Memory is consent gated; reports are existing server-generated artifacts; Market Wire attributes upstream sources. These capabilities must remain distinct and honest.

Observed workflow gaps:

- Research checks availability by fetching the list, discards that response, then fetches again. The second request swallows errors and can show a successful empty list while a request failed. The create form has no persistent labels, does not navigate to its created run, and claims a fixed daily allowance without reading an entitlement.
- Chat deletes history optimistically and suppresses API failures. A rejected deletion looks successful until reload. New/open history actions have no local error recovery, delete controls disappear from keyboard traversal, and a failed pre-stream submission can erase the drafted question.
- Reports present a long unsearchable archive. On a narrow display a selection can update a detail panel far below the viewport with no indication. Invalid dates produce misleading age text.
- Memory independently catches settings/items/proposals failures without exposing incomplete sections. A failed proposal read can look like an authoritative empty inbox.
- Market Wire can receive older filter responses after newer selections and has no rejected-request catch. Its “Ask Agent” URL carries a topic that the chat page currently ignores.

## Execution prompt

Act as a product engineer designing an evidence-first Agent SaaS research workspace. Work from the actual contracts above rather than inventing retrieval or model capabilities. Make the path **question → authorized research → observable progress → sources → saved result** clear on desktop and a 390px phone. Use current browser/React facilities (semantic forms, native keyboard behavior, focus management, request-generation guards and progressive disclosure) rather than adding a new framework or decorative dependencies.

Implement coherent workflow improvements in the owned research components. Preserve the existing brand tokens, both themes and visual styles, English/Chinese copy, model choices, explicit tool approval, memory consent and backend-derived billing. Source documents and retrieved content are evidence, never authority to perform tool actions. Do not automatically retry a chargeable Agent run or claim that a failed request was refunded without settlement data. Keep feature-disabled, unauthorized, loading, empty, stale and service-error states distinct.

For every async action, state what happened and offer a bounded next step. Destructive history changes become visible only after the server confirms them. Preserve drafts when submission fails before a run begins. A successful research launch opens its actual run. Loading and stale-data notices must not pretend a task succeeded or that saved information is absent. Route transfers may populate a draft but must not send it or spend credits.

## Acceptance and validation

1. Research first load consumes one actual list response; network errors have retry, cached-list refresh failure is explicit, and active runs poll without stale response races. A labeled keyboard-submittable form respects the backend's 120-character name and 4000-character prompt limits. Successful creation opens the returned run; rejected creation keeps the question.
2. Chat history create/open/delete errors remain visible, duplicate actions are locked, failed delete retains the conversation, keyboard controls remain reachable, and failed pre-stream send preserves a reusable draft without automatic replay. Topic links fill the composer only.
3. Report archive search and selection expose their state, work by keyboard and move a phone reader to the selected report without animation under reduced motion. Invalid/future timestamps never assert current evidence.
4. Memory distinguishes loading/failed reads from empty results and offers retry while retaining already loaded data; existing approval/consent/delete confirmations remain intact.
5. News filtering ignores late responses and catches service failures; “Ask Agent” arrives with an editable topic draft.
6. Run TypeScript/lint/build, existing offline upgrade smoke, and meaningful browser scenarios for these changed behaviors on desktop and 390px. Use synthetic loopback API responses only; capture screenshots and record console/network failures. No real model/provider, notification, tunnel, trade, Stripe or deployment actions.

## Ownership and review boundary

Owned: research/chat/memory/reports/news components and their localized routes, plus dedicated tests and this brief. Shared `nav.tsx`, `globals.css`, `ui.tsx`, translations and `api.ts` remain with their assigned owners. Root integrates, independently reviews and publishes. A feature-disabled real deployment remains disabled; this change does not enable providers or LIVE trading.

## Implementation and self-review

Implemented the evidence-first workspace without new dependencies or backend feature enablement:

- Research consumes its first list response, distinguishes a failed refresh from an empty inbox, labels and validates its creation form, opens the actual returned run, and searches the currently loaded task list. Detail preserves the gate's first confirmed snapshot, scopes every asynchronous run update to its run ID, and displays real source excerpts and full Markdown artifacts instead of only a graph and artifact title.
- The shared capability hook publishes its successful payload only for the current request generation. Cleanup, dependency changes and retries invalidate both state and payload ownership. Synchronous throws and null/undefined rejections remain recoverable; disabled services remain distinct from missing account permissions.
- Chat history mutations wait for server acknowledgement, preserve the last view after failure and use a visible recovery notice. A pre-stream failure keeps a reusable draft. News topics fill a draft only; they never send it. Existing model selection, approvals, attachments and authoritative settlement behavior remain.
- Stop owns conversation setup, permission setup and streaming through the same AbortController. The only shared client API edits are optional signal arguments to `createAgentConversation` and `setAgentPermission`; existing calls remain compatible. Stop/Send use separate button keys and Stop prevents default activation: reusing one DOM node as it changed from `type=button` to `type=submit` could otherwise replay a still-present draft after cancellation. Late cancellation reloads cannot replace a subsequent run.
- Memory errors name incomplete reads without inventing empty lists. Disabling known memory types and deleting/rejecting memories stay available despite unrelated read errors; enabling and consent require fresh settings. Immediate action/read locks and snapshot generations prevent a retry from overwriting an acknowledged setting change. Preference badges say On/Off, rather than claiming data freshness.
- Report deep links select only from the existing user-owned response; unknown IDs cannot request another user's report. Search/type filters keep the preview within the matching set, so an ETH search cannot leave a BTC memo displayed as the result. Phone selection moves focus to the readable memo; date uncertainty never authorizes a stale resend.
- News filter requests ignore late responses, catch failures and avoid mixing an old filter's headlines into a new selection. Original attribution and source links remain.

Validation commands (from `apps/web`, pnpm10.28.2, Node24):

```sh
corepack pnpm@10.28.2 typecheck
corepack pnpm@10.28.2 lint
NEXT_PUBLIC_API_URL=/__dev-api corepack pnpm@10.28.2 build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --test tests/capability-gate.test.cjs
# Prepare .next-build/standalone public + .next-build/static as in web-runtime-security.yml.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium corepack pnpm@10.28.2 exec playwright test --config playwright.research.config.ts
```

The dedicated production suite contains 14 scenarios on desktop and a 390px phone, including Chinese controls, real loopback HTTP creation/permission/consent/history reads, first-success/second-failure snapshot retention, source and Markdown reading, delayed filter responses, failed deletions, refund preservation and setup cancellation before any chargeable message. A delayed streaming-body case controls only a real browser ReadableStream/AbortSignal transport; it does not mock the application run state. Pending permission cancellation uses an actual held HTTP response and checks that the composer recovers before that response is released, with exactly one permission request and zero message requests.

The hook suite bundles the production module with real React StrictMode and Chromium in an owned temporary directory and random loopback server; no test route ships in the application. Its same-byte script is also run against a `git show 48fe315` source copy. Every listener, browser and temporary bundle is closed in `finally`. Product fixture pages settle their request handlers and close before the dependent backend shuts down. Standalone server and browser requests are restricted to loopback; provider, notification, payment, trading and tunnel services are never contacted.

Self-review and independent review specifically covered request ownership, old run IDs, cancellation before the first streamed event, native button activation, privacy-preserving memory disable, retry/mutation races and backend-derived billing. Existing dependency compatibility (8), runtime security (5) and offline guard (2) checks remain passing. Source hashes, build logs, browser logs, baseline comparison and screenshots are retained under `/workspace/scratch/round6-ui-research-*` for the coordinating reviewer.

Limits: task search covers the currently loaded recent server page and says so; it is not an all-history retrieval claim. Source verification labels reflect server snapshot metadata, not independent fact checking. Actual model/provider configuration, memory ownership/consent, credit settlement and backend research execution remain server responsibilities. No provider, LIVE flag, deployment or production resource was enabled. Root owns final combined build, independent review, PR publication and merge.

Final local result: TypeScript, lint and the 143-page production build pass; **28/28** dedicated production browser cases pass, plus **8/8** real React/Chromium hook tests. The byte-identical hook test against original48fe315 source reports **0 passed /8 failed**. Independent reviewer findings above were fixed before the final source freeze.
