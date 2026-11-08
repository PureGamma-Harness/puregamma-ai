# Chart reliability implementation prompt and review record

Base: `48fe3154fe56a0640d08148f0c7eaf7825af2da7`. Scope: the shared `PlotlyChart` component used by options surfaces and backtest artifacts. The existing pages keep their fixed Plotly2.35.2 loading policy and API contracts.

## Execution prompt

Act as a React19/App Router product engineer for a financial research workspace. Inspect the actual chart component, callers, figure shape and locale context. Repair the verified behavior: an unavailable CDN/CSP library leaves a blank chart after five seconds; the existing immediate render and interval can issue two `newPlot` calls; an asynchronous rendering rejection is unhandled; obsolete asynchronous renders can outlive their owning React view.

Implement honest, bilingual preparation/ready/unavailable states with deliberate retry. Provide an accessible, bounded table preview of values actually present in the supplied figure; preserve zero and missing values without fabricating financial numbers or labels. Keep the existing `{figure,className}` props compatible. Use existing React, locale context and development dependencies; do not install a replacement charting stack, change either product page or its CDN, make provider requests, enable features, or deploy.

Each rendering attempt must own a separate canvas and its timers. Start `newPlot` once after the library is ready, handle synchronous and asynchronous failure, reject late results after timeout/retry/prop change/unmount, and purge the obsolete canvas when the API operation settles. A non-cancellable third-party promise can remain unresolved; detach its owned canvas and do not allow it to affect the current view. Do not claim to cancel Plotly internals.

## Acceptance and verification

- Missing library transitions from an announced preparation state to an announced unavailable state with a retry action; it never becomes a false successful chart.
- A delayed library before the deadline renders once. Rejection and hung rendering lead to recoverable errors. Retry uses the latest figure without allowing an older promise to replace current state.
- Unmount removes the owned canvas and timers. An in-flight operation that settles later is purged and cannot update a new canvas.
- Data preview is derived from supplied traces only, bounded in series/points/columns/cell size, readable with keyboard and at390px, and never inserts HTML from trace values. Empty/unrepresentable data is described honestly.
- English and Chinese follow the existing locale provider. Preparation and failure have useful accessible names/status semantics, and keyboard users can reach retry and data disclosure.
- Verify with focused data tests and actual Chromium against a local fixture rendering this exact component. Exercise missing, delayed, rejecting, retry, stale settlement and unmount scenarios on dedicated port3214. Intercept all external requests; an instrumented local Plotly API models library timing and failure. This proves component lifecycle behavior, not CDN availability or actual3D rendering fidelity.
- Record baseline red/green, commands, frozen source and self-review. Root/operations independently reviews the final diff before merge.

## Implementation and self-review

The component now keeps a native preparation/status view, a five-second library deadline, a ten-second render deadline, explicit retry and a data disclosure. Every attempt owns a new imperative canvas. Sync throws and asynchronous rejections enter the same recoverable state. Cleanup detaches the obsolete canvas immediately; a pending third-party operation is purged when it settles. Ready charts use a labelled group so the renderer's own interactive descendants are not hidden behind an image role. The existing figure/className props and page CDN policy are unchanged.

`plotly-chart-data.ts` limits the preview to six series, fifty points, ten fixed trace fields and120-character cells. It preserves supplied zero/negative/missing values, does not traverse arbitrary objects, bounds nested-array display, and does not recompute a financial result. The table has row/column headers and its own keyboard-focusable scroll region. English/Chinese copy follows the existing locale provider.

Verification on Node24.22.1 / pnpm10.28.2:

- Original-source browser probes failed both selected checks; a separate direct counter probe observed two `newPlot` calls for an already present library. These baseline exploratory probes precede the product edit; no byte-identical eight-case baseline claim is made.
- Final **8 Chromium lifecycle/interaction cases pass**: missing library with English/Chinese actual data preview at390px; delayed library; already present library starts once; async rejection; sync throw; figure replacement plus unmount with late settlements; render timeout plus retry; unmount before library arrival. All outside browser requests were blocked, and each case asserts no page errors/outside requests.
- Final **4 data tests pass**: real zero/negative/ragged values; series/point/cell caps without arbitrary serialization; malformed/nonfinite values; mesh/candlestick coordinates.
- `pnpm typecheck` and `pnpm lint` exit0. Lint reports existing repository warnings. No dependency lock/manifest, product page or CDN version changed. Build-generated next-env.d.ts was restored.
- The local Next fixture explicitly waits for hydration before measuring business deadlines, and selects the chart alert rather than Next's route announcer. Earlier exploratory fixture timing/locator failures are superseded by the final12/12 run; production timeouts were not enlarged to satisfy those checks.

Reproduce from `apps/web` after the existing frozen dependency install:

```sh
node --test tests/plotly-chart-data.test.cjs tests/plotly-chart-browser.test.cjs
pnpm typecheck
pnpm lint
```

The test uses dedicated local port3214 (`CHART_TEST_PORT` can select another), the configured Chromium executable, local `/usr/bin/chromium` when available, or Playwright's installed Chromium. Its temporary app imports the exact production component and locale provider. It closes the browser, stops its server and removes owned temporary files. Optional `CHART_TEST_ARTIFACT_DIR` writes English/Chinese mobile snapshots.

Limits: the fixture's controlled Plotly API proves lifecycle and recovery, not CDN availability, actual Plotly3D rendering fidelity or every production theme. Snapshots use the minimal fixture styles and are not a whole-product visual signoff. A third-party promise cannot be cancelled; a permanently unresolved operation may retain its own internal resources after its canvas is detached. The bounded table is a preview, not the complete figure or an export. Root owns final combined production-build/browser validation and independent review before merge.

Independent reviewer `mvp_ui_operations` reviewed the exact production commit `fd54079` and its two source SHA256s, the tests and this prompt; independently reran all four data cases; found no blocker. The reviewer separately confirms the non-cancellable-promise and partial-data-preview boundaries. Report: `/workspace/scratch/round6-chart-independent-review.json`. Root owns final integration/CI and merge.

Primary methods checked on2026-11-08: [React effect synchronization and cleanup](https://react.dev/reference/react/useEffect), and [Plotly function reference including purge](https://plotly.com/javascript/plotlyjs-function-reference/). HTTP200 excerpts and response hashes are retained in `/workspace/scratch/round6-chart-primary-references.json`. These are lifecycle and progressive-recovery improvements to the existing Agent SaaS research surfaces; model retrieval and trading authority remain outside a chart renderer.
