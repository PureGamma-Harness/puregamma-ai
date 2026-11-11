import { expect, type Page } from "@playwright/test";
import { test, SESSION } from "./auth-onboarding-fixtures";

const user = { id: "offline-onboarding", email: "reader@example.invalid", name: "Offline Reader", role: "user", plan: "Pro", credit_balance: 0 };
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNXsAAAAASUVORK5CYII=";
type Scenario = { saves: Record<string, unknown>[]; saveFailures: number[]; puzzleFails: boolean; googleTargets: string[]; errors: string[] };

const scenarios = new WeakMap<Page, Scenario>();
test.beforeEach(async ({ page, context, baseURL, onboardingBackend }) => {
  const state: Scenario = { saves: [], saveFailures: [], puzzleFails: false, googleTargets: [], errors: [] };
  scenarios.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await context.addCookies([{ name: "pg_session", value: SESSION, url: baseURL! }]);
  await page.setExtraHTTPHeaders({ "x-forwarded-host": onboardingBackend.authority, "x-forwarded-proto": "http" });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let status = 200;
    let payload: unknown;
    if (url.pathname === "/api/me") payload = { user };
    else if (url.pathname.endsWith("/frontend/plugins")) payload = { plugins: [], capabilities: { plan: "Pro", allowed_data_sources: [], allowed_skills: [], max_attachments: 0 } };
    else if (url.pathname === "/api/auth/onboarding") {
      state.saves.push(route.request().postDataJSON());
      status = state.saveFailures.shift() || 200;
      payload = status === 200 ? { ok: true, user } : { detail: "Offline failure" };
    } else if (url.pathname === "/api/auth/captcha/puzzle") {
      status = state.puzzleFails ? 503 : 200;
      payload = status === 200 ? { captcha_id: "offline-puzzle", background: png, piece: png, piece_y: 20, width: 320, height: 120, expires_in: 300 } : { detail: "Offline verification unavailable" };
    } else if (url.pathname === "/api/auth/google/authorize") {
      state.googleTargets.push(url.searchParams.get("return_to") || "");
      status = 503;
      payload = { detail: "Offline OAuth unavailable" };
    } else if (url.pathname === "/api/auth/email/login") payload = { user, auth_header: {} };
    else { status = 501; payload = { detail: "No live provider in this test" }; }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.routeWebSocket("**/*", (socket) => socket.close());
});

test.afterEach(async ({ page, onboardingBackend }) => {
  expect(scenarios.get(page)?.errors).toEqual([]);
  expect(onboardingBackend.requests.filter((request) => request.method !== "GET" || !request.session)).toEqual([]);
});

test("authentication fields keep labels and localized password visibility", async ({ page }, info) => {
  for (const locale of ["en", "zh"]) {
    const zh = locale === "zh";
    await page.goto(`/${locale}/login`);
    await expect(page.getByLabel(zh ? "邮箱" : "Email address", { exact: true })).toHaveAttribute("autocomplete", "email");
    const password = page.getByLabel(zh ? "密码" : "Password", { exact: true });
    await password.fill("OfflineReader123");
    await page.getByRole("button", { name: zh ? "显示密码" : "Show password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: zh ? "隐藏密码" : "Hide password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.MVP_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.MVP_SCREENSHOT_DIR}/${info.project.name}-${locale}-login.png`, fullPage: true });
  }
});

test("signup and recovery fields have persistent labels and password guidance", async ({ page }) => {
  await page.goto("/en/signup");
  await expect(page.getByLabel("Name (optional)", { exact: true })).toHaveAttribute("autocomplete", "name");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-describedby", "signup-password-hint");
  await expect(page.locator("#signup-password-hint")).not.toBeEmpty();
  await page.goto("/zh/forgot-password");
  await expect(page.getByLabel("邮箱", { exact: true })).toBeVisible();
  await page.goto("/en/reset-password?token=offline-token");
  await expect(page.getByLabel(/New password/i, { exact: true })).toBeVisible();
});

test("verification has bounded failure, retry, native modal focus and Escape recovery", async ({ page }) => {
  const state = scenarios.get(page)!;
  state.puzzleFails = true;
  await page.goto("/en/login");
  await page.getByLabel("Email address", { exact: true }).fill("reader@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("OfflineReader123");
  const submit = page.locator('form button[type="submit"]');
  await submit.click();
  const dialog = page.getByRole("dialog", { name: "Security Check", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("could not be loaded");
  await expect(dialog.getByRole("button", { name: "Close verification" })).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    // Native Chromium dialogs keep document focus inert, while Tab may still
    // reach browser chrome. Browser controls are outside the document's scope.
    expect(await dialog.evaluate((element) => element.contains(document.activeElement) || !document.hasFocus())).toBe(true);
  }
  await page.getByLabel("Email address", { exact: true }).evaluate((element) => (element as HTMLInputElement).focus());
  expect(await dialog.evaluate((element) => element.contains(document.activeElement) || !document.hasFocus())).toBe(true);
  state.puzzleFails = false;
  await dialog.getByRole("button", { name: "Refresh verification" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("slider")).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(submit).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("OfflineReader123");
});

test("research choices survive Back and refresh with exposed selection state", async ({ page }, info) => {
  await page.goto("/en/onboarding/assets");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: /^HYPE/ }).click();
  await expect(page.getByRole("button", { name: /^HYPE/ })).toHaveAttribute("aria-pressed", "true");
  if (process.env.MVP_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.MVP_SCREENSHOT_DIR}/${info.project.name}-onboarding-assets.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /^Momentum/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/onboarding\/channels$/);
  await page.getByRole("navigation", { name: "Setup progress" }).getByRole("link", { name: /Assets/ }).click();
  await expect(page.getByRole("button", { name: /^HYPE/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^BTC/ })).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByRole("button", { name: /^HYPE/ })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/en/onboarding/style");
  await expect(page.getByRole("button", { name: /^Momentum/ })).toHaveAttribute("aria-pressed", "true");
});

test("storage denial preserves in-tab choices and server success still navigates", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Storage disabled", "SecurityError"); } });
  });
  await page.goto("/zh/onboarding/assets");
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.getByRole("button", { name: /^HYPE/ }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("button", { name: /^动量跟踪/ }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/dashboard$/);
  await expect(page.getByRole("main").getByRole("navigation", { name: "研究工作流程", exact: true })).toBeVisible();
  expect(scenarios.get(page)!.saves).toHaveLength(1);
  expect(scenarios.get(page)!.saves[0]).toMatchObject({ preferred_assets: ["HYPE"], preferred_style: "momentum", notification_channels: ["email"] });
});

test("save failure retains recipients for retry and never claims an authentication error", async ({ page }) => {
  const state = scenarios.get(page)!;
  state.saveFailures = [503];
  await page.goto("/en/onboarding/channels");
  await expect(page.getByRole("checkbox", { name: /^Telegram/ })).toBeEnabled();
  await page.getByRole("checkbox", { name: /^Telegram/ }).check();
  await page.getByLabel("Telegram Chat ID or username", { exact: true }).fill("@offline-reader");
  const submit = page.getByRole("button", { name: "Complete Setup", exact: true });
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "could not be saved" })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/onboarding\/channels$/);
  await expect(submit).toBeEnabled();
  await expect(page.getByLabel("Telegram Chat ID or username", { exact: true })).toHaveValue("@offline-reader");
  await expect(page.getByRole("textbox", { name: /Email/ })).toHaveCount(0);
  await submit.click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole("main").getByRole("navigation", { name: "Research workflows", exact: true })).toBeVisible();
  expect(state.saves).toHaveLength(2);
  expect(state.saves[1]).toMatchObject({ notification_channels: ["email", "telegram"], telegram_chat_id: "@offline-reader" });
});

test("only an expired session redirects setup to login with the correct return path", async ({ page }) => {
  scenarios.get(page)!.saveFailures = [401];
  await page.goto("/zh/onboarding/channels");
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/zh/onboarding/channels");
});

test("OAuth return destinations reject backslash and control-character escapes", async ({ page }) => {
  const state = scenarios.get(page)!;
  for (const target of ["/\\outside.invalid", "/\n/outside.invalid"]) {
    await page.goto(`/en/login?returnTo=${encodeURIComponent(target)}`);
    await page.getByRole("button", { name: /Google/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Google/ })).toBeVisible();
  }
  expect(state.googleTargets).toEqual(["/en/chat", "/en/chat"]);
});

test("@http dashboard destination uses owned server reads and renders unavailable data honestly", async ({ request, onboardingBackend }) => {
  for (const locale of ["en", "zh"]) {
    const start = onboardingBackend.requests.length;
    const response = await request.get(`/${locale}/dashboard`, {
      headers: { Cookie: `pg_session=${SESSION}`, "x-forwarded-host": onboardingBackend.authority, "x-forwarded-proto": "http" },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(locale === "zh" ? 'aria-label="研究工作流程"' : 'aria-label="Research workflows"');
    expect(onboardingBackend.requests.slice(start).sort((left, right) => left.path.localeCompare(right.path))).toEqual([
      { method: "GET", path: "/api/billing/subscription", session: true, status: 501 },
      { method: "GET", path: "/api/market/snapshot", session: true, status: 501 },
      { method: "GET", path: "/api/reports", session: true, status: 501 },
    ]);
    expect(html).toContain(locale === "zh" ? "账户与计费数据暂不可用" : "Account and billing data unavailable");
  }
});


test("@http setup documents expose real main content before JavaScript", async ({ request, page }) => {
  const titles = {
    en: { assets: "Choose assets to track", style: "Choose your research style", channels: "How would you like to receive research?" },
    zh: { assets: "选择需要跟踪的资产", style: "选择你的研究风格", channels: "你希望通过什么渠道接收研究内容？" },
  };
  for (const locale of ["en", "zh"] as const) {
    for (const step of ["assets", "style", "channels"] as const) {
      const response = await request.get(`/${locale}/onboarding/${step}`, {
        headers: { Cookie: "pg_session=offline-mvp-auth" },
      });
      expect(response.status()).toBe(200);
      // DOMParser creates an inert document: application scripts never run and
      // hidden streamed segments cannot masquerade as visible main content.
      const workspace = await page.evaluate((html) => {
        const document = new DOMParser().parseFromString(html, "text/html");
        const main = document.querySelector("main#main-content");
        const heading = main?.querySelector("h1");
        return {
          mainCount: document.querySelectorAll("main").length,
          heading: heading?.textContent?.trim(),
          headingHidden: Boolean(heading?.closest("[hidden]")),
          progress: main?.querySelector("nav[aria-label]")?.getAttribute("aria-label"),
          currentSteps: main?.querySelectorAll('[aria-current="step"]').length,
          selectableChoices: main?.querySelectorAll("button[aria-pressed]").length || 0,
          form: Boolean(main?.querySelector("form")),
        };
      }, await response.text());
      expect(workspace.mainCount).toBe(1);
      expect(workspace.heading, `${locale}/${step} must render its actual heading inside main`).toBe(titles[locale][step]);
      expect(workspace.headingHidden).toBe(false);
      expect(workspace.progress).toBe(locale === "zh" ? "首次设置进度" : "Setup progress");
      expect(workspace.currentSteps).toBe(1);
      if (step === "channels") expect(workspace.form).toBe(true);
      else expect(workspace.selectableChoices).toBeGreaterThan(0);
    }
  }
});
