# Research workspace product experience

The authenticated workspace now leads with the user's question, research output
and next action. The previous dashboard lost its question during the Agent
handoff, Research repeated introductions and described an idle list as running,
and a selected report's reader started below the phone's first viewport.
This round repairs those workflows and gives the existing product one shared
visual and interaction system.

## Coordination prompt and implementation briefs

Work from the actual repository, routes, API contracts and rendered product.
Assign nonoverlapping ownership, write each domain's execution prompt before
implementation, preserve business and release boundaries, and require another
agent to review the result. Use existing browser and framework primitives where
they solve the observed problem. Judge actual desktop and phone pages separately
from engineering test results. Keep failures and superseded candidates visible;
never turn a loading indicator, an HTTP 200 or a retry into proof of completion.

| Domain | Prompt, implementation and acceptance |
| --- | --- |
| Design system | [Foundation](worldclass-foundation.md): typography, opaque working surfaces, spacing, contrast, shared controls, both appearances and themes |
| Navigation and account | [Shell](worldclass-shell.md): task groups, native page finder, focus ownership, confirmed identity and cancelled request publication |
| Overview and reading | [Dashboard](worldclass-dashboard.md): exact bilingual editable drafts, immediate question entry, actual source timestamps and embedded Markdown hierarchy |
| Agent | [Conversation workspace](worldclass-agent-workspace.md): stable title/question context, reachable composer and native compact history |
| Research and reports | [Outcomes and reader](worldclass-research-reports.md): factual activity, outcome-first artifacts and mobile archive/reader navigation |
| Secondary controls | [Account, mobile access and Portfolio](worldclass-secondary.md): associated labels, fixed touch targets and finite quota semantics |
| Client navigation | [Research detail boundary](worldclass-research-navigation.md): observed completed-module stall, route-local loading and real content acceptance |
| Workflow verification | [Browser contracts](worldclass-workflow-tests.md): owned offline fixtures, actual navigation, unknown/zero states and preserved failure guards |

The existing [RAG](rag-orchestration.md), [Harness](harness-quality.md) and
[tool evidence](harness-tool-output.md) contracts remain the basis of the
research surfaces. The UI retains source excerpts, provenance, limitations,
actual cost, cancellation and refund information; it does not reinterpret them
as permission to execute trades or enable a provider.

## Product decisions

- One compact workspace heading, 248px desktop rail, 64px header and real
  16px phone / 24px desktop content gutters. Inter is self-hosted with its
  included SIL OFL license; no runtime dependency or external font was added.
- The dashboard opens a localized, editable Agent draft using the canonical
  `topic` parameter. Existing `prompt` links remain supported. Navigation does
  not send the message. Question content, Unicode and ambiguous repeated query
  values have explicit behavior.
- Completed research leads with its artifact and evidence. Process details are
  secondary native disclosures; active work keeps its progress first. Zero
  active tasks is an observed idle state.
- Reports uses a desktop archive/reader and a real mobile reader with an
  accessible return to the preserved archive filters. Source absence, stale
  content and send restrictions remain explicit.
- Agent keeps the conversation title and latest question visible while its
  transcript scrolls separately from the composer. Compact history and page
  search use native dialogs with keyboard and focus recovery.
- The shared working-area boundary follows Next's actual layout segments.
  Real destination changes can show useful loading while a module is delayed;
  assigning a newly created conversation's URL through native history keeps
  its active first-message transaction mounted.
- Account loading, unavailable identity, missing credits and a confirmed zero
  are separate states. Quotas follow the backend's finite-number contract:
  null or missing data means unknown, never an unlimited entitlement.
- Billing summaries adapt their columns to available space. Long Gateway
  values wrap inside their metric cards; direct account/PIN controls have
  associated labels and fixed 44px minimum targets.

## Evidence and repeatable checks

The same recorded GET-only scenarios compare the baseline with desktop
1440×1000 and phone 390×844, light and dark, at zero entry scroll. Supplementary
checks cover Classic, keyboard interaction, 1280×720 reading/composition,
Billing at 1024/1280 and six-digit account values. Recorded fixture content is
not a claim about live market conditions or a configured external provider.

The visual review found and corrected missing gutters, a small Retry target,
selected-text contrast and Billing field collisions. Workflow review separately
found single-Escape search recovery and a queued native close event affecting a
reopened dialog. Research native navigation also required its own segment
loading boundary; its unchanged URL, full artifact and source assertions are
required together. Detailed evidence and the limits of the controlled comparison
are recorded in the domain briefs.

The [Web workflow](../../.github/workflows/web-runtime-security.yml) runs the
existing authentication, navigation, research and operation suites, the added
product-experience suite, actual React/browser probes, session ownership checks,
and separate full/default-launch route jobs. Its `web-product-experience`
artifact retains real fixture screenshots, geometry and network records on
success as well as failure. Test discovery, executed results, manual visual
review and external-provider readiness are separate claims.

No release gate, provider credential, payment policy or LIVE trading permission
is enabled by this presentation upgrade.
