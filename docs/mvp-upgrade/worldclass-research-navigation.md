# Research detail navigation boundary

## Repository-grounded execution prompt

Diagnose intermittent native Link navigation from the real Research list to a
research detail route in frozen candidate 3, then introduce the smallest route
boundary supported by the evidence. Preserve the permanent main landmark,
shared Main / Suspense hydration fallback, no-JavaScript content, native Link,
API / capability policy and actual detail effects. Do not disable prefetch,
replace the navigation with a reload, add retries or extend the acceptance
timeout. Root owns the next build and controlled old / new verification.

## What was observed

Frozen build `VP4OqBxkTE4WKX2yOborP` intermittently stays on `/en/research` after
clicking the real run Link. The failed workflow trace contains a complete 200
RSC navigation response with the matching build ID, run ID, client component
reference and completed metadata records. Its detail chunk also returns 200,
yet no detail API effects mount. This is distinct from missing backend data or
a still-downloading response.

An independent GET-only probe on port 3216 retained the native Link and the
same 10-second URL assertion. It observed failures in two seven-run batches
(one failure in each); these are diagnostic samples, not acceptance runs.
Post-timeout runtime inspection confirmed that all five required Webpack chunk
promises resolved and module 6508 exported `ResearchRunDetail`.

A final probe stopped at its first failure to check identity directly. The
shared main's alternate Suspense fiber retained a wakeable with status
`fulfilled`, and its value was strictly identical to
`webpack(6508).ResearchRunDetail`. The root still had equal pending / suspended
lanes, zero pinged lanes and no scheduled callback. The external App Router
action queue had completed its detail-route state, while the committed tree
and browser URL still represented the list. The code required by that
particular wakeable had therefore resolved; more fetch time was not the missing
condition in the observed snapshot.

Diagnostic evidence, outside the repository:

- `/workspace/scratch/worldclass-rsc-foundation-probe/artifacts-v2/probe-native-research-navigation-fiber-diagnostic-repeat1/runtime.json`
- `/workspace/scratch/worldclass-rsc-foundation-probe/artifacts-v3/probe-native-research-navigation-fiber-diagnostic/runtime.json`
- The adjacent `trace.zip` files and original workflow failed artifacts remain
  retained. Runtime hooks and Webpack inspection were probe-only; no product
  bundle or RSC response was rewritten.

## Narrow candidate change and its limits

Add the conventional Next loading entry at
`app/[locale]/research/[runId]/loading.tsx`, rendering the existing localized
`WorkspaceLoading` feedback. This gives the detail segment its own loading seed
and Suspense boundary, so its lazy client module has a route-local boundary
instead of relying solely on the shared main boundary across the transition.
The feedback has no fake research result, API request or extra main landmark.

The observed failure establishes a fulfilled module wakeable with an uncommitted
navigation. It does not by itself establish a unique React / Next vendor root
cause or prove that the new segment boundary resolves every timing case. This
is a narrowly scoped candidate fix. Root must compare the unchanged real Link
flow against immutable candidate 3 and the new build, with zero retries and
the same 10-second expectations, and assert completed detail content / evidence
as well as the URL. Existing held-module and no-JavaScript main guards remain
required. A loading indicator alone is not a successful navigation.

## Source verification

Scoped ESLint for the loading entry, the application's
`tsc --noEmit --incremental false` check and `git diff --check` pass. This owner
does not build or approve its own candidate for publication. The old / new
navigation comparison was subsequently completed against frozen builds.

## Controlled browser verification

The coordinator preserved candidate 3's standalone runtime before rebuilding.
The unchanged real Research scenario, fixture, desktop dimensions, 10-second
expectations and zero-retry configuration ran twenty times against each build:
candidate 3 (`VP4OqBxkTE4WKX2yOborP`) retained one URL/commit failure and nineteen
passes; candidate 4 (`xxkKmnp0tHoyC0q8uMtGE`) passed all twenty, including the
complete artifact body and source evidence.

A separate regression holds the actual detail-page module request before list
entry. Both candidate 3 checks, desktop English and phone Chinese, retained the
failure to commit the detail URL while held. Both candidate 4 checks committed
the detail URL, displayed localized loading, kept native page search and focus
recovery usable, and mounted no detail API effects until release. After release,
both required the real artifact and evidence. This scenario joins the ordinary
flow in the twenty-case product suite; it does not add a CI retry loop.

Candidate 5 (`996YQ1y_sQpfHWDQFPH6n`) changes only the sidebar's own scroll
visibility relative to candidate 4. The loading entry is byte-identical, and its
complete twenty-case product suite passes again with zero retries. Normal image
and route-cache output is distinguished from preserved application code in the
runtime manifests. These are bounded browser results and do not identify a
unique vendor defect or certify every possible schedule.
