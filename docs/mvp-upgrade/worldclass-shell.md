# Focused workspace shell

## Repository evidence and execution prompt

The existing shell repeats language and appearance controls in its persistent
rail and header, presents Research as “Harness” and Portfolio as “NAV”, and
promotes one delivery integration above the main work. The header lacks page
context and initially renders an unconfirmed Free plan and signed-out actions.
An absent credit balance is also displayed as zero.

Act as PureGamma's workspace designer and frontend maintainer. Organize the
existing destinations around research tasks, give secondary tools progressive
disclosure, retain every route and release gate, and use the shared 248px rail,
64px header and 44px control contract. Keep one desktop theme/style cluster and
retain language/font access plus the full mobile preferences. Preserve the
permanent main, its phase-aware Suspense boundary, native mobile navigation,
skip link and focus/scroll restoration.

Show account loading, confirmed identity, unavailable and signed-out states
honestly. Only a successful identity read or confirmed user payload may name a
plan or balance; zero must be an actual balance. Preserve the last confirmed
user on transient failures and protect refresh/event/unmount ownership.

Add a usable local page finder rather than an imitation content-search field.
Its destinations come from the same navigation definition, preserve locale and
do not call a model or search backend. Use native modality, keyboard filtering,
selection, Escape and focus return. Never open it over an unrelated dialog.

## Acceptance

- Core tasks use understandable English/Chinese labels and share the same
  desktop, drawer and command-menu destination definitions.
- Header context, one visible desktop theme/style cluster and compact account
  facts fit without squeezing the mobile brand or producing horizontal overflow.
- Unknown identity never flashes Free, zero credits or account-creation actions;
  only HTTP 401 changes a confirmed user into signed-out chrome.
- Cmd/Ctrl+K and the header control open a real page finder. Arrow/Enter/Escape,
  empty results, route changes and focus return work in both locales.
- The drawer keeps its native focus trap, Escape/backdrop/resize behavior and
  body-scroll recovery; the command dialog does not stack with unrelated dialogs.
- All source changes receive independent review and real browser verification.
  Existing error, business, release-gate and time-budget assertions remain.

## Implementation and self-review

The shared navigation now groups all 17 existing destinations into Workspace,
Manage and progressively disclosed Tools & resources. Research and Portfolio
use product language; their legacy terms remain finder keywords. Desktop header
controls provide one theme/style cluster, rail controls provide language/text
size, and the mobile drawer retains both. Header breadcrumb supplies current
page context without local/UTC clocks or tier badges.

Short desktop viewports keep the current page fully readable in the scrollable
rail. On mount, path/locale changes and navigation-size changes, the sidebar
compares the current link with its own visible bounds and adjusts only its own
scrollTop by the required delta, with a 4px inset. A ResizeObserver also handles
viewport/font-size changes and a previously hidden mobile rail becoming visible.
Hidden or zero-height elements are skipped. This never calls scrollIntoView,
moves document/main scroll or changes keyboard focus. Candidate4's 1024×720
Account screenshot exposed the current 40px row with only 18px visible; the
coordinator owns the rebuilt candidate's geometry and navigation acceptance.

The native page finder uses those real destination definitions and enabled
plugin entries. It filters locally, preserves locale, supports Arrow/Enter,
Escape/backdrop, composition-aware input and focus return, and ignores Cmd/Ctrl+K
when another modal owns the keyboard. Opening from the drawer closes that drawer.
The permanent main and its phase-aware inner Suspense boundary are unchanged.

The account view has explicit loading, known, unavailable and signed-out states.
It never uses cached storage as identity evidence. Initial financial deltas wait
for confirmation; confirmed deltas cancel an older read before merging. A
transient failure preserves confirmed state. Reads are serial, aborted on unmount
and ignored after their ownership expires. Actual finite zero is displayed;
missing or invalid balances stay unavailable.

Two tightly scoped supporting changes require independent review:

- `getMe` accepts an optional abort signal. `requestStrict` checks that signal
  immediately after fetch, before HTTP 401/402 side effects, and after JSON,
  before user-state synchronization. Existing callers without signals retain
  their behavior; no billing, backend permission or mutation policy changed.
- `publishUserState` keeps its existing storage and event detail shape. WeakMap
  metadata distinguishes full replacement identity payloads from partial deltas,
  which can contain cached identity fields after the existing storage merge.
  This prevents quota/capability updates from authenticating that cache and lets
  the account view consume the original financial delta. Other listeners keep
  their existing contract.

Final shell-scoped ESLint (including both supporting libraries) and whole-web
TypeScript checks passed with exit 0 on 2026-11-13. Source review verified that
all original destinations, native drawer effects, preference storage behavior,
phase fallback and no-signal API behavior remain. No tests, dependency versions,
release gates or backend permissions were modified by this workstream. No build,
commit or push was run by this workstream.

The coordinator owns independent review, production build and frozen real-browser
evidence across locales, breakpoints and appearance settings. Static checks do
not claim final visual or asynchronous workflow acceptance.

## Browser findings and corrections

The new real-browser journeys exposed two page-finder recovery defects. A search
input can consume the first Escape to clear its query before the dialog receives
it; the input now explicitly closes on Escape after the IME guard. A second
failure was traced to native event ordering: after `close()` and a quick
`showModal()`, an old queued `close` event arrived while the new dialog was open.
Unconditionally handling that event closed the new session and redirected its
Arrow/Enter keys to the trigger. The close handler now synchronizes parent state
only while the dialog is actually closed. A real Candidate 2 event probe retained
the failing sequence; the original destination and focus assertions remain.
The coordinator verifies both corrections in the final rebuilt artifact.
