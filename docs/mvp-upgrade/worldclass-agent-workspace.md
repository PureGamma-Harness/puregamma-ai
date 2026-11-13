# Agent workspace product refinement

## Repository evidence and execution prompt

Baseline: `aff416f3d26a9ad78598d451076bd0b9347e95fd`.
The existing Agent owns history, permission setup, streamed messages, source
evidence, cancellation and authoritative billing in `components/agent-chat.tsx`.
`chat-workspace-composer.tsx` owns attachment uploads, permission confirmation
and explicit submission. Those behaviors remain the product contract.

The actual 390px populated baseline shows the end of an answer and several
evidence rows without a persistent conversation title. History actions are
below the feed, directly above the composer. The `/chat` route adds a separate
marketing header while the saved-conversation route renders the same Agent
without that wrapper. The empty state has another h1, producing inconsistent
heading and height ownership. Dashboard handoff also uses `prompt`, while the
Agent route previously accepted only `topic`.

Act as the product engineer for a calm, evidence-first financial Agent workspace.
Give both route forms one compact semantic heading, persistent conversation
context and a reachable composer. Keep message scrolling inside the transcript,
use readable prose widths, make metadata secondary and preserve access to actual
evidence, cost, permissions and run state. Use existing semantic tokens and native
browser interaction rather than a new framework or decorative dependency.

Keep every network/run/history/billing handler, explicit Send/Stop action,
draft-recovery rule and ownership guard intact. Topic links seed an editable
draft only. Accept the old prompt spelling deliberately, without accepting an
ambiguous array or automatically starting a request. Do not infer a completed
research run, available provider, refund or known balance from missing data.

## Acceptance and ownership

1. Empty, loading and populated conversations have one visible h1. Both `/chat`
   and `/chat/[conversationId]` use the same component-owned geometry. At
   390×844 and normal desktop heights, the header and primary composer action
   remain in the viewport; messages scroll within their feed.
2. History remains available on mobile and desktop, with a native modal on
   mobile, Escape/backdrop dismissal and focus/scroll restoration. Desktop
   history collapse does not make mobile history unreachable after resizing.
3. Starter suggestions only replace/focus the editable draft. Existing failed
   send, immediate Stop, permission approval, history errors, source evidence
   and authoritative credit settlement remain visible and behave as before.
4. A scalar `topic` wins, including an explicitly blank value. Only an absent
   `topic` permits scalar `prompt` compatibility. Arrays/non-scalars do not seed
   a draft. The existing trim and 4,000-Unicode-code-point limit remain.
5. Preserve composer/test labels and existing error/budget assertions. Require
   real browser handoff, mobile/history, long-message and original async-flow
   checks, plus independent source and actual-screen review before merge.

Owned files are the Agent component, its actual workspace composer, the localized
entry route and this brief. Shared CSS, navigation, business APIs, research,
reports, permission policy and default release gates belong to other owners.
The root agent coordinates the production build, visual comparison, integration
checks and publication. This brief does not claim those checks have already run.

## Implementation and source review

The component now owns its persistent title, current question or draft context,
and truthful running status. Its height uses the shared 64px application header
and 16px/24px main padding. The transcript is the flexible scrolling area;
the workspace heading and composer are siblings outside that scroll area.
Conversation controls use a 224px desktop rail at 1280px and above, a 52px
collapsed rail, or a native mobile/tablet dialog. The browser owns modal focus,
background inertness and Escape. Explicit close and desktop resize restore the
page's previous body overflow; history is available even after rail collapse.

The empty state has three actual, editable starter questions and a subordinate
heading. Replies use a 768px maximum prose width. Evidence checks and source
links remain readable, with cost/refund information shown from the same recorded
fields as before. Repeated destination links are available under a native
disclosure. The research link says “Open research workspace,” matching its
actual navigation action. The composer uses shared primary-action tokens and
44px controls. Research settings open above it without expanding its normal
layout height. No dependency or global CSS was added by this domain change.

The route consumes Next's async search parameters as
`{ topic?: string | string[]; prompt?: string | string[] }` and passes only a
bounded string to `AgentChat.initialPrompt`; that prop initializes the controlled
textarea. It does not initiate a POST. Required integration cases are:

| Input | Editable initial draft |
| --- | --- |
| `topic=BTC` | `BTC` |
| scalar `topic` and scalar `prompt` | trimmed `topic` |
| explicitly blank `topic`, nonblank `prompt` | blank |
| repeated/array `topic`, scalar `prompt` | blank |
| absent `topic`, scalar `prompt` | trimmed `prompt` |
| absent `topic`, repeated/array `prompt` | blank |
| absent both or other non-string runtime values | blank |
| leading/trailing whitespace or over 4,000 Unicode code points | trimmed, first 4,000 complete code points |

The handoff consumer remains the actual `ChatWorkspaceComposer` textarea,
`data-testid="chat-composer-input"`. History/New, harness composer, error,
permission approval and billing selectors and accessible action labels remain.
The saved conversation route and the entry route render the same Agent; shared
`ReportMarkdown` now starts assistant headings at h2 through its separate owner.

## Verification and remaining acceptance

Focused Next ESLint on all three source files passed after the final source
change. It reports the pre-existing `openConversation` effect dependency warning.
Owned `git diff --check` passed. A whole-workspace TypeScript run during this
change was blocked only by an unrelated command-menu icon union error; the
root integration run owns the final clean TypeScript/build result.

A mechanical comparison with the baseline confirms the initialization/history
handlers, run/Stop/quote/billing/history handlers and composer attachment and
permission helpers are byte-for-byte unchanged. The machine-readable hashes
and assertions are retained in the execution evidence file
`/workspace/scratch/worldclass-agent-handler-preservation.json`. Source review
also checked that suggestions and retry preparation only change the draft,
native dialog markup is not displayed while closed, and active Stop remains a
button independent of disabled submission.

Static source checks do not establish visual acceptance. The root agent must
still inspect actual 390×844 and 1280×900 empty/populated pages, all four theme
and material combinations, long answers with Markdown headings, retained
rejected drafts, immediate cancellation, permission flow, history errors,
authoritative billing/refunds and the real dashboard handoff. No tests, budgets,
provider behavior or release gates were weakened for this implementation.
