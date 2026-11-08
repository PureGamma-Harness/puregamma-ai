# Authentication and first-run workflow

## Repository context and execution prompt

Act as the product engineer for PureGamma's English/Chinese authentication and
three-step research setup. Work from the existing Next.js App Router and React
19 implementation; preserve the financial research positioning, server-owned
entitlements, cookie authentication, CAPTCHA, and disabled trading gates.

Repository evidence at `48fe315`:

- `onboarding/channels/page.tsx` redirects every save failure to login and reads
  storage outside its error boundary; even an HTTP 500 or denied storage loses
  the user's path or leaves the button busy.
- Assets and style reset on remount; visual selection buttons expose no state.
- Authentication inputs use placeholders without persistent labels; password
  visibility is English-only. Successful verification messages share the
  negative error surface.
- Email login accepts a leading slash as its return target, including browser
  backslash URL normalization. Google/X helpers duplicate that rule.
- The locale segment has no shared loading or recovery boundary.

Implement the smallest coherent upgrade that lets a user enter credentials,
understand progress, recover from a network failure, revisit setup choices, and
reach the actual dashboard. Use native forms and semantic labels, toggle state,
status announcements, bounded browser drafts, and Next segment recovery.
Personalization choices are context, never authorization or risk instructions.
Do not introduce a vector database, new UI framework, or optimistic financial
success. Those technologies do not solve the observed workflow defects.

## Acceptance criteria

1. Login/signup/password recovery have visible associated labels, correct
   autocomplete, localized password controls, and announced errors/status.
2. Only local, slash-prefixed return paths without backslashes/control characters
   may navigate after authentication; valid localized paths retain queries.
3. Assets and style survive Back and refresh. Storage denial cannot throw or
   prevent progression in the current tab. No credentials or recipients are
   newly persisted by the draft helper.
4. Setup save failures remain on the form with retry; only HTTP 401 asks the user
   to authenticate. Server success still reaches the dashboard when local
   persistence is denied. Busy state always settles.
5. Email delivery accurately describes the account-email-only backend contract;
   recipient entry must not suggest arbitrary email delivery is supported.
6. Selection states, a three-step progress navigation, labels, mobile layouts,
   and shared loading/error feedback work in both locales.

## Method and validation

Follow the existing React controlled-form model with functional updates and
explicit request states; use WAI-ARIA button state and live-region guidance,
native browser constraint validation, and Next.js segment loading/error
boundaries. References: https://react.dev/reference/react/useState,
https://nextjs.org/docs/app/api-reference/file-conventions/error,
https://www.w3.org/WAI/ARIA/apg/patterns/button/.

Validate pure navigation/draft contracts with Node against the actual TypeScript
modules. Exercise real Next pages in Chromium at desktop and 390px: labels,
password visibility, selected state, Back/refresh, unavailable storage, HTTP
500 retry, HTTP 401 login, and success navigation. All API responses are explicit
offline fixtures; no real emails, CAPTCHA providers, payments, or trades.
Run typecheck, lint, production build and the existing upgrade smoke after
integration. Record self-review and independent review evidence before merge.

## Implementation and self-review

The final source uses native CAPTCHA modality with an explicit SubmitEvent opener and connected-element focus restoration, request-generation ownership for puzzle refresh, persistent form labels, localized visibility controls, and success-timer cleanup. CAPTCHA load failure is an announced retryable state. Only local return paths pass the shared helper used by email/Google/X navigation.

Setup research choices are validated independently and remain in tab memory when storage reads/writes fail; a failed write cannot resurrect older readable storage. Recipients are not newly persisted. Delivery uses the server-owned account email and only offers Telegram when the actual account plan permits it; iMessage remains subject to its existing verification workflow. A503 save leaves the form and recipients available for retry; only401 asks for login with the correct return path. A committed server save still navigates when local caches are unavailable.

Validation on the final production artifact: **16/16 Chromium desktop/390px journeys passed**, with both locales and no uncaught page errors. **5/5 Node contracts pass on Node22 and24**. Node24 production build generates143pages; types and lint pass with existing project warnings. A first dev exploratory run was discarded because cold compilation and the framework route-announcer affected fixture timing/locators. The first production run correctly exposed focus-return behavior; that three-file production defect was fixed, independently source-reviewed and all16journeys rerun successfully. The frozen old-source comparison is recorded separately; it is not counted as candidate validation.

Reproduction from `apps/web` (pnpm10.28.2):

```sh
node --test tests/auth-onboarding-compat.test.cjs
NEXT_PUBLIC_API_URL=/api NEXT_PUBLIC_INITIAL_LAUNCH_MODE=false pnpm build
mkdir -p .next-build/standalone/.next-build
cp -R public .next-build/standalone/
cp -R .next-build/static .next-build/standalone/.next-build/
pnpm exec playwright test --config playwright.auth-onboarding.config.ts
```

Use Playwright's installed browser, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. PG_AUTH_DEV=1 is an optional development runner, not a substitute for final production validation. A local prior artifact may be compared with MVP_AUTH_BASELINE=1 and MVP_AUTH_BASELINE_ROOT; production feature defaults are unchanged. Evidence: `/workspace/scratch/round6-auth-browser-verified.log`, `round6-auth-build-final.log`, `round6-auth-unit-final.log`, `round6-auth-unit-node22.log`, and the independent foundation review. The test harness uses explicit fake API responses and proves UI behavior, not real email/CAPTCHA-provider availability or a completed login against a live account.
