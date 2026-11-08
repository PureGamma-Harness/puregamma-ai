# Whole-route recovery follow-up

## Repository evidence and execution prompt

The frozen integrated production route audit reproduces a React error on both
localized admin pages when an API returns `{detail: {code, message}}`.
`AdminCreditConsole.messageFromError` assumes `detail` is a string and returns
an object into rendered error state. The daily-push server page also awaits
strict preferences and subscription reads without scoped error recovery; an
optional service failure replaces the page with a generic route boundary.

Act as the owner of these observed recovery paths. Accept only actual strings
from unknown API error envelopes; preserve ordinary error messages and use
localized fallbacks for arrays, null and unsupported detail objects. Keep the
admin component's actions and permissions unchanged. For unavailable daily-push
preferences or plan, retain the page context and show explicit localized retry
feedback. Do not fabricate preferences, a subscription or notification delivery.
Use the existing native components and server request policy.

The API documentation component and the JEV advisory page also nest a second
`main` inside the shared
layout landmark. Use an ordinary content container so assistive technology and
route navigation have one unambiguous main region.

## Acceptance and review

- Structured errors, validation arrays, null and ordinary messages never become
  React child objects; string detail and detail.message stay readable.
- Daily-push successful real reads retain the original settings component; a
  failed prerequisite displays scoped unavailable feedback without controls.
- Existing full/default launch gates and all mutation/provider behavior remain.
- Reproduce against the original code, run actual-source focused checks, then
  rerun the production route audit in both modes on rebuilt frozen artifacts.
- Another agent reviews the exact final diff and regression evidence.

## Validation

Actual-source focused checks exercise ten admin error shapes, both localized
successful daily settings paths and five prerequisite failures per locale.
The API/JEV landmark corrections are covered by the unchanged whole-route unique-main
assertion. Final production artifact checks remain pending.
