# Secondary control accessibility

## Repository-grounded execution prompt

The secondary-route review found Account password / iMessage fields whose
accessible names relied on placeholders, an unassociated MobileAccess PIN
label, and direct control targets smaller than the shared 44px contract.
Polish only these existing controls in `app/[locale]/account/page.tsx`,
`components/mobile-access-panel.tsx` and `components/portfolio-panels.tsx`.
Associate labels with native inputs, provide relevant autocomplete hints and
give direct inputs / actions a 44px minimum. Preserve handlers, payloads,
authorization, busy / disabled conditions, value text, PIN masking and native
validation. Do not redesign pages, add forms or install a dependency.

## Implementation and acceptance

- Password inputs have visible localized labels, stable IDs / names and native
  `current-password` / `new-password` autocomplete. Existing password types,
  minimum length, required constraints and submit handlers are unchanged.
- iMessage recipient and code inputs have visible localized associated labels.
  The recipient keeps its text input behavior so both phone numbers and Apple
  ID email addresses remain accepted; it disables unwanted capitalization and
  spelling suggestions. The code keeps its six-character limit and numeric
  input mode, and advertises `one-time-code` autocomplete.
- The custom PIN keeps its existing visually hidden label and visible helper;
  React `useId` now associates the label with its input. The eight-digit pattern,
  maximum length, mask / reveal output and admin checks are unchanged. PIN
  autocomplete is off.
- Direct Account and MobileAccess actions / inputs, and the Portfolio provider
  action, have a 44px CSS-pixel minimum target rather than a rem-based minimum,
  so the minimum persists with the compact font preference.
- Account quota rendering follows the actual finite-number API contract in
  `getAgentQuota`, `apps/api/services/agent_service.py` and
  `packages/billing/plans.py`. Null, absent or non-finite values render `—`;
  none establishes an unlimited entitlement or an observed zero. True numeric
  zero remains zero. The credit balance keeps its confirmed user-balance
  fallback, including zero. Loading, requests and handlers are unchanged.
  Independent review caught and rejected an intermediate interpretation of
  nullable local frontend types as unlimited; it is absent from the final source.

Self-review confirms the diff contains only labels, native input metadata,
minimum target sizing, truthful quota presentation and the PIN's stable
identifier. Root owns the rebuilt
artifact, existing auth / operation checks and actual page review. A source
check does not establish full-route accessibility or visual acceptance.

## Verification

Scoped ESLint for the three changed TSX files exits successfully with zero
errors; it reports the pre-existing MobileAccess QR `<img>` optimization
warning. The application TypeScript check (`tsc --noEmit --incremental false`)
and `git diff --check` pass. No test was added to mirror these style changes,
and this owner did not build. Candidate 2 screenshots predate this patch. Root
will integrate these changes in the next artifact and run the existing auth /
operation checks.
