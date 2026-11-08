# Data source status implementation prompt and acceptance

Base: `48fe3154fe56a0640d08148f0c7eaf7825af2da7`. This closes route-audit findingF05. The existing localized page passes only sources into `DataSourceTable`, losing the API transport's unavailable/status/error metadata. The table retries every empty initial list, and both a legitimate empty catalog and a failed/forbidden read become the same admin-login warning.

## Execution prompt

Act as the product engineer for the bilingual source/evidence control surface in an Agent SaaS. Keep the existing source catalog API, attribution/license fields, PRIMARY display scope and server authorization authoritative. Use explicit React request ownership and progressively recoverable states rather than fabricated healthy rows or model-generated error explanations.

Preserve SSR availability metadata. Distinguish a successfully read empty catalog, a successfully read catalog containing only non-primary sources, unauthorized/forbidden access, network/service failure and an explicit in-flight retry. Retain last successful rows only for recoverable read trouble, label them as last-confirmed/stale, and disable their operational controls until the current read succeeds. On permission failure, hide old source cards. A failed read must never authorize source control, and a retry must never synchronize/restart a provider.

The only product changes are `data-source-table.tsx`, the localized data-sources page, and optional availability fields in the `getDataSources` return type. Keep the existing URL, source/mockMode fallback values and generic API transport unchanged; annotate the empty fallback itself with `unavailable:true` so an explicitly allowed mock fallback still cannot masquerade as a successful empty catalog. Existing explicit source actions remain behind the same server permission/licensing gates. Add no provider, privileged role, dependency, feature flag or production deployment.

## Acceptance

- SSR401 and403 are shown as access states; status0/network and5xx as service states. Their text does not pretend that the catalog is empty or always blame administrator authentication.
- A successful `sources:[]` displays a genuine empty state, and a nonempty non-primary-only catalog is described as outside this panel's scope rather than empty.
- Retry is explicit, announced and bounded by the existing transport timeout; only the latest current response may update the view. A stale success cannot overwrite a newer denial, and stale failure cannot overwrite a newer success.
- A failed refresh preserves prior successful rows with an explicit last-confirmed warning and disabled actions; a permission denial hides them. Only another successful read restores current controls.
- A current preview or explicit action returning an actual401/403 also invalidates the previously privileged catalog and preview. A pending retry or later service failure must not reveal that cache again; unrelated errors keep their existing recovery message without guessing an HTTP status.
- Controls have English/Chinese names, visible loading/recovery feedback, and keyboard/touch targets. No API error body or secret is echoed to users.
- Validate state boundaries and SSR prop wiring with focused actual-source checks. Run real React/Chromium with a static local fixture and controlled HTTP responses; no new Next dev compilation or full build is required for this slice. Prove empty/access/service/retry/stale/latest-result/non-primary cases without any provider mutation. Root owns final integrated production-build validation and independent review.

## Implementation, verification and self-review

The page now passes the API transport's three optional availability fields into the table. `getDataSources` retains its URL, locale and catalog/mockMode values and marks its own empty fallback unavailable, including the explicitly allowed mock-fallback path. A real successful empty catalog remains an empty state.

The table owns the full catalog before applying its unchanged PRIMARY display scope. It does not auto-fetch a legitimate empty/non-primary catalog. Explicit reload has a current lifecycle/request identity; obsolete results and unmounted reads cannot overwrite newer props. Recoverable service failure retains only a previously successful snapshot, labels each retained card as last-confirmed, and disables operational actions. A current401/403 clears cached catalog and preview state, so even a pending or failed retry after denial cannot resurrect old privileged cards. Unknown thrown failures are labelled generically without inventing an HTTP code or echoing error bodies. Loading/error status messages are outside the busy cards region so announcements are not deferred by an ancestor's busy state.

Existing explicit sync/control/check/preview methods retain their API/server gates; the component serializes their UI actions and does not initiate a provider mutation from a reload. Independent operations review reproduced a preview403 leaving the old card and enabled Pause control. The final correction invalidates the old privileged catalog and preview when the current preview/action rejects with an actual401/403 status; unknown exceptions retain generic recovery copy. Default initial-launch/auth/provider gates and the generic API transport are unchanged.

Validation from `apps/web` with the frozen pnpm10.28.2 environment:

```sh
node --test tests/data-source-status.test.cjs tests/data-source-browser.test.cjs
pnpm typecheck
pnpm exec next lint --file components/data-source-table.tsx --file 'app/[locale]/data-sources/page.tsx' --file lib/api.ts
```

- Final **10 real React/StrictMode/Chromium browser scenarios pass** with the production TSX bundled statically by the already installed Next webpack compiler. A random127.0.0.1 HTTP server supplies controlled catalog/preview GET responses; icons/status presentation and the API boundary are fixture shims. No Next dev server or whole-project build was started for this slice.
- Coverage: genuine empty catalog; non-primary-only catalog; English/Chinese401 and403;503→loading→success; stale retained snapshot and disabled actions; old success vs current denial and old failure vs current rows; network failure→successful empty; unmount; catalog403 and preview401/403→pending retry→503→fresh success without redisplaying private cache.
- **4 actual-source checks pass on Node24.22.1 and Node22.23.4**: state boundaries, denials/malformed data, real SSR page-prop metadata wiring, and the actual helper's preserved URL/locale/fallback contract with explicit unavailability. The final Node24 combined run is **14/14**,0failures/errors; the unchanged4 checks were previously also run underNode22.
- Original48fe315 component probes for empty and non-primary catalogs both fail. Their selected assertion bodies and fixture are the same; the final additional permission-cache regression is not claimed as an original-source run. Evidence: `round6-data-source-before-final.log`.
- Canonical-declaration full web typecheck exits0; focused final lint exits0 with no warnings. Generated next-env.d.ts is restored. No manifest/lock or other API helper changed.
- Every browser case asserts zero outside requests and zero provider-mutation calls, with only GET catalog/preview traffic. HTTP8-second read-timeout behavior includes Chromium's transparent retry after a dropped connection; the test waits beyond that existing budget rather than changing production deadlines. All browsers, connections, temporary bundles and local listeners are torn down.
- The final preview-denial assertion is also run unchanged against411243a source and fails with the old generic preview alert. Operations' separate actual HTTP probe first reproduced the enabled stale card; this final regression exercises both401 and403 and verifies no cached cards reappear during pending/failed retries.

Evidence: `/workspace/scratch/round6-data-source-preview-denial-final.log`, `round6-data-source-preview-denial-before.log`, `round6-data-source-final-node22.log`, `round6-data-source-preview-denial-canonical-typecheck.log`, `round6-data-source-preview-denial-lint.log` and `round6-data-source-handoff.json`.

Limits: the static fixture proves component behavior and actual server-page prop wiring, not a full Next production-theme/provider integration or licensing approval. Root owns the final combined production build/routes/CI. Independent root/operations review is pending; this self-review does not substitute for it.
