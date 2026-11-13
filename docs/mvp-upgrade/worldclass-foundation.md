# World-class visual foundation

## Repository evidence and execution prompt

Baseline `aff416f` already has a functional Glass/Classic appearance system,
theme and font-size persistence, native navigation, a permanent main landmark
and independently tested workflow ownership. The current screenshots still show
several decorative layers, mixed panel/label/button vocabularies and workspace
headers that consume too much of the working viewport. The global stylesheet
also declares Inter without a matching font face and has separate radius and
display scales.

Act as the shared visual-foundation maintainer for the existing PureGamma
research SaaS. Make the working interface calm, precise and readable. Use a
single spacing/type/material vocabulary across both persisted appearance modes,
with opaque data surfaces, restrained shell material and a semantic cobalt
accent. Establish a clear page-title/section/body/metadata hierarchy and a
consistent 44px control contract. Use the supplied local Inter variable font,
with system CJK fallbacks; do not request a remote font.

Preserve exports, component props, semantic heading levels, theme/font/style
preferences, status meanings, error/empty distinctions and all application
business logic. Do not move Main/Suspense, change native-dialog behavior,
rewrite domain components or enable a release capability. Global CSS has one
owner; coordinate its shell geometry and shared class interfaces with domain
owners rather than appending competing override blocks.

## Ownership and public contracts

This slice owns `app/globals.css`, `tailwind.config.ts`, `components/ui.tsx`,
`components/puregamma.tsx`, `components/terminal/editorial.tsx` and
`components/terminal/intelligence-shell.tsx` only, plus this brief.

- Shell geometry: `--pg-rail-width: 248px`, `--pg-header-height: 64px`; navigation
  owns the corresponding application-shell markup and padding.
- Main padding is 16px on phones and 24px on desktop; the shell owner applies
  that geometry without changing the permanent landmark or phase fallback.
- Shared type uses local `/fonts/inter-latin-variable.woff2` as Inter with
  platform CJK fallbacks. Asset and license publication belongs to root.
- Existing semantic color classes remain supported. Shared Card/ResearchCard,
  PageHeader/SectionTitle and form controls retain their props and exports.
- Public component classes live in Tailwind's components layer so existing
  caller utilities can refine layout: `pg-card`, `pg-button` with
  `pg-button-primary` / `pg-button-secondary` / `pg-button-danger`, `pg-input`,
  `pg-badge`, `pg-page-header`, `pg-page-header-row`, `pg-page-copy`,
  `pg-page-eyebrow`, `pg-page-title`, `pg-page-description`, `pg-page-actions`,
  `pg-metadata`, `pg-reading`, `pg-empty-state` and `pg-error-state`.
- `--pg-action` is stable cobalt with white text; `--pg-accent` is theme-aware
  ink for focus, navigation and small semantic accents. `bg-accent` uses the
  action token so a filled button does not inherit pale Dark-theme ink.
- Domain agents own their page contents, heading ownership and layout; they
  consume this foundation without independently editing the global stylesheet.

## Acceptance

1. At desktop and phone widths, page headings are restrained, working content
   has priority, controls have visible focus and coherent sizing, and Chinese
   text is not stretched by Latin uppercase tracking rules.
2. Both themes and both appearance preferences render readable opaque data
   cards. Material is concentrated in shell/selected interaction surfaces;
   background grids and overlapping ambient layers do not show through text.
3. Shared controls use a coherent spacing/radius/type vocabulary. Read-only
   cards do not acquire a misleading hover affordance. Error/empty feedback
   remains explicit and readable.
4. Existing font-scale choices and reduced-motion/transparency behavior remain.
   No package, provider, API, state-machine or release-policy change is needed.
5. Root integrates the local font, runs appropriate type/lint/build and existing
   functional checks, then independently reviews real desktop/mobile screenshots.
   Static source review or passing CI alone does not establish visual acceptance.

## Implementation and review

Implemented the six owned source files without changing component APIs or
workflow logic. Both themes now define a complete neutral palette, with local
Inter and CJK fallbacks, 12–16px working surfaces, 44px shared controls, compact
24–32px page titles and a 72ch reading measure. Cards remain opaque in both
appearances; the shell retains a small material difference in Glass mode.
Removed the page-wide background grid, misleading static-card hover, broad
appearance panel transparency and whole-panel pressed transforms. Mobile and
reduced-transparency rules now resolve in the right order. Reduced motion also
disables the shared data-pulse animations and loading skeleton pulse.

Self-review preserved exports, props, event handlers, stored preferences,
status/plan identities, heading semantics and explicit empty/error states.
`ReportMarkdown` intentionally renders source headings from level two inside
the agent workspace, using the root-owned safe Markdown renderer's new option.
The permanent main landmark, loading phases, native dialog and consent / API /
release gates are outside this slice and were not changed by this owner.

Verification performed on 2026-11-13:

- The installed PostCSS parser accepts the complete stylesheet.
- Scoped ESLint passes for the five TypeScript / TSX source files with an empty
  result log. No new dependency or test was added.
- `git diff --check` passes for the integrated worktree at review time.
- A temporary palette calculation reviewed 60 combinations of primary,
  secondary, tertiary and status text against three opaque surfaces in both
  themes, including status text over the actual 12% status-color alpha fill.
  Every sampled combination meets 4.5:1; the minimum is 4.59:1. This is token
  evidence, not a full-page accessibility certification. Evidence is stored in
  `/workspace/scratch/worldclass-foundation-palette-review.json` for this run.

Root still owns the combined typecheck, build, existing functional checks and
independent screenshot review across themes, appearances and viewport sizes.
This source review does not establish final visual acceptance, and the owner
does not approve publication of its own visual work.

## Candidate 2 source corrections

Read-only integration review of candidate 1 found two shared contracts that
needed correction. Navigation had removed its utility padding while the shared
main rule still only supplied width and scroll margin. The main rule now
consumes `--pg-main-padding`: 16px below the desktop rail breakpoint and 24px
from 1024px. This also matches the chat workspace's existing two-sided viewport
height subtraction.

Gateway and usage metric grids relied on a descendant `.text-2xl` selector for
long numeric wrapping. The new metric type size no longer matched that selector.
MetricCard now owns `min-width: 0`, a full-width limit and `overflow-wrap:
anywhere` for values, so counters and formatted currency remain readable in a
narrow column without tying layout safety to a typography class.

The active navigation label now uses `--accent-strong` against its existing
accent-soft fill. Review of the combined text and fill found that ordinary
Light-theme accent ink reached only 4.23:1 on the opaque rail, despite passing
against a plain panel. The stronger text token restores the intended contrast
without changing the active marker, preference storage or navigation behavior.
Declared-color compositing gives 5.21:1 Light / 7.76:1 Dark on the Classic rail;
the 92% Glass rail reaches at least 5.14:1 / 7.68:1 across the page base and
maximum page accent-tint endpoints. The opaque mobile drawer reaches 4.92:1 /
8.62:1 in either appearance. These are computed color ratios; the rebuilt-page
review still owns focus, actual rendered text and complete accessibility.

These changes are candidate 2 source corrections. They are not included in the
frozen candidate 1 build `GJEerWRSI2zFJ3dEJc07I`. Root will rebuild and validate
the new artifact after candidate 1 screenshot consumers have stopped.
