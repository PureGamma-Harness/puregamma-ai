import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test as base } from "@playwright/test";

const key = { id: "offline-key", name: "Research terminal", prefix: "sk-pg-offline", last_four: "1234", status: "active", rate_limit_rpm: 60, last_used_at: null };
const snapshot = (connected = true) => ({
  connected, nav: 0, available_cash: 0, daily_change: 0, daily_change_pct: null,
  nav_history: [], holdings: [], accounts: [], asset_classes: {},
  connections: connected ? [{ id: "offline-account", provider: "hyperliquid", name: "Research wallet", status: "CONNECTED", last_sync: null }] : [],
  providers: { plaid: false, ibkr: false, hyperliquid: true, evm: false },
});
const usage = { start: "", end: "", granularity: "day", buckets: [], by_model: [], by_key: [], totals: { requests: 0, success: 0, errors: 0, input_tokens: 0, output_tokens: 0, cache_tokens: 0, reasoning_tokens: 0, avg_latency_ms: 0, max_latency_ms: 0, cost_usd: "0" } };
type Fixture = { authority: string; origin: string; nav: number; failPortfolio: boolean; failGateway: boolean; failMutation: boolean; reads: string[]; mutations: string[]; reset: () => void };

const test = base.extend<{ backend: Fixture; browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
  backend: async ({}, use) => {
    const state: Fixture = { authority: "", origin: "", nav: 0, failPortfolio: false, failGateway: false, failMutation: false, reads: [], mutations: [], reset() { this.failPortfolio = false; this.failGateway = false; this.failMutation = false; this.mutations.length = 0; this.reads.length = 0; } };
    const server = createServer(async (request, response) => {
      const path = new URL(request.url || "/", "http://localhost").pathname;
      if (request.method === "GET") state.reads.push(request.url || "");
      let status = 200;
      let body: unknown;
      if (request.method !== "GET") {
        state.mutations.push(`${request.method} ${path}`);
        if (state.failMutation) { status = 503; body = { detail: "Offline mutation temporarily unavailable" }; }
        else if (request.method === "DELETE" && path === "/api/portfolio/accounts/offline-account") body = snapshot(false);
        else if (path === "/api/portfolio/hyperliquid/connect") body = snapshot();
        else if (path.endsWith("/rotate")) body = { key: "sk-pg-offline-new-secret", api_key: { ...key, id: "replacement", name: "Research terminal replacement" } };
        else if (request.method === "DELETE" && path === "/api/gateway/keys/offline-key") body = { ok: true };
        else if (path === "/api/gateway/keys") {
          let raw = "";
          for await (const chunk of request) raw += chunk;
          body = { key: "sk-pg-offline-created-secret", api_key: { ...key, id: "created", name: JSON.parse(raw).name } };
        } else { status = 501; body = { detail: "Unexpected offline mutation" }; }
      } else if (path === "/api/me") body = { user: { id: "offline-user", email: "user@example.invalid", name: "Offline Researcher", role: "user", plan: "Max", credit_balance: 0 } };
      else if (path === "/api/api/frontend/plugins") body = { plugins: [], capabilities: { plan: "Max", allowed_data_sources: [], allowed_skills: [], max_attachments: 0 } };
      else if (path === "/api/portfolio") { status = state.failPortfolio ? 503 : 200; body = status === 200 ? { ...snapshot(), nav: state.nav } : { detail: "Offline portfolio unavailable" }; }
      else if (path === "/api/portfolio/plaid/transactions") body = { transactions: [] };
      else if (path === "/api/portfolio/pm") body = { available: false, reason: "unavailable" };
      else if (path === "/api/portfolio/pm/history") body = { points: [] };
      else if (path === "/api/gateway/dashboard") {
        status = state.failGateway ? 503 : 200;
        body = status === 503 ? { detail: "Offline gateway unavailable" } : {
          account: { status: "active", monthly_spend_limit_usd: "0", current_month_spend_usd: "0", month_started_at: "" },
          wallet: { currency: "USD", available_balance_usd: "25", lifetime_credited_usd: "25", lifetime_debited_usd: "0", topup_min_usd: "5.00", topup_max_usd: "10000.00" },
          subscription: { plan: "Max", stripe_customer_id: null }, spend_usd: { today: "0", month: "0", lifetime: "0" }, models: [], wallet_ledger: [], topups: [],
        };
      } else if (path === "/api/gateway/keys") body = { keys: [key], limit: 10 };
      else if (path === "/api/gateway/requests") body = { requests: [], total: 0 };
      else if (path === "/api/gateway/usage") body = new URL(request.url || "/", "http://localhost").searchParams.has("model") ? usage : { ...usage, by_model: [{ model: "offline-research", requests: 0 }], by_key: [{ api_key_id: "offline-key", name: "Research terminal", requests: 0 }] };
      else { status = 501; body = { detail: `Unconfigured offline endpoint: ${path}` }; }
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    state.authority = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    state.origin = `http://${state.authority}`;
    try { await use(state); }
    finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  },
});

test.beforeEach(async ({ page, context, baseURL, backend }, testInfo) => {
  await page.emulateMedia({ colorScheme: testInfo.project.name === "mobile" ? "dark" : "light" });
  await context.addCookies([{ name: "pg_session", value: "offline-operations", url: baseURL! }]);
  await page.setExtraHTTPHeaders({ "x-forwarded-host": backend.authority, "x-forwarded-proto": "http" });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ response: await route.fetch({ url: `${backend.origin}${url.pathname}${url.search}` }) });
    return route.continue();
  });
  await page.routeWebSocket("**/*", (socket) => socket.close());
});

test("gateway requires named confirmation and safe keyboard dismissal before revoke", async ({ page, backend }, testInfo) => {
  await page.goto("/en/gateway");
  const expectedWidth = page.viewportSize()!.width;
  const geometry = await page.evaluate((expectedWidth) => ({
    viewport: window.innerWidth, document: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll("main *")).map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right), overflow: getComputedStyle(element).overflowX })).filter((element) => element.right > expectedWidth + 1).slice(0, 12),
  }), expectedWidth);
  expect(geometry.document - expectedWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
  if (process.env.PG_OPERATIONS_CAPTURE === "1") {
    const screenshot = testInfo.outputPath("gateway.png");
    await page.screenshot({ path: screenshot, animations: "disabled", scale: "css" });
    await testInfo.attach("gateway", { path: screenshot, contentType: "image/png" });
  }
  const revoke = page.getByRole("button", { name: "Revoke Research terminal", exact: true });
  await revoke.click();
  const dialog = page.getByRole("dialog", { name: "Revoke API key?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Research terminal");
  expect(backend.mutations).toEqual([]);
  await expect(dialog.getByRole("button", { name: "Keep key" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Revoke key", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Keep key" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(revoke).toBeFocused();
  await revoke.click();
  if (process.env.PG_OPERATIONS_DIAGNOSTICS === "1") console.log("Dialog geometry", JSON.stringify(await dialog.evaluate((element) => ({
    viewport: { innerWidth, innerHeight, scrollX, scrollY, visualWidth: visualViewport?.width, scale: visualViewport?.scale },
    dialog: element.getBoundingClientRect().toJSON(),
    controls: Array.from(element.querySelectorAll("button")).map((button) => { const r = button.getBoundingClientRect(); return { text: button.textContent, rect: r.toJSON(), hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 200) }; }),
  }))));
  await dialog.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "revoked" })).toBeVisible();
  expect(backend.mutations).toEqual(["DELETE /api/gateway/keys/offline-key"]);
});

test("failed confirmed rotation stays recoverable without losing the current key", async ({ page, backend }) => {
  backend.failMutation = true;
  await page.goto("/en/gateway");
  await page.getByRole("button", { name: "Rotate Research terminal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rotate API key?" });
  await dialog.getByRole("button", { name: "Rotate key", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("try again");
  await expect(dialog.getByRole("button", { name: "Rotate key", exact: true })).toBeEnabled();
  backend.failMutation = false;
  await dialog.getByRole("button", { name: "Rotate key", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("New API key", { exact: true })).toBeVisible();
});

test("unavailable gateway never presents fallback zero balances or enabled mutations", async ({ page, backend }) => {
  backend.failGateway = true;
  await page.goto("/en/gateway");
  await expect(page.getByRole("alert").filter({ hasText: "Gateway is temporarily unavailable" })).toBeVisible();
  await expect(page.getByTestId("gateway-balance").getByText("—", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create key", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pay with Stripe", exact: true })).toBeDisabled();
  expect(backend.mutations).toEqual([]);
});

test("invalid top-ups stay local and clipboard failure preserves the one-time key", async ({ page, backend }) => {
  await page.goto("/en/gateway");
  const amount = page.getByLabel("Top-up amount (USD)");
  await amount.fill("5.001");
  await page.getByRole("button", { name: "Pay with Stripe", exact: true }).click();
  await expect(page.getByText("Enter a USD amount with at most two decimals.", { exact: true })).toBeVisible();
  expect(backend.mutations).toEqual([]);
  await page.getByLabel("Key name", { exact: true }).fill("Browser research");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await page.getByRole("button", { name: "Copy key", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "select and copy" })).toBeVisible();
  await expect(page.getByLabel("New API key", { exact: true })).toBeVisible();
});

test("portfolio errors expose retry and a genuine zero balance remains visible", async ({ page, backend }, testInfo) => {
  backend.failPortfolio = true;
  await page.goto("/en/portfolio");
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load your portfolio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect Research wallet" })).toHaveCount(0);
  backend.failPortfolio = false;
  await page.getByRole("button", { name: "Retry portfolio", exact: true }).click();
  await expect(page.getByTestId("portfolio-nav")).toHaveText("$0.00");
  if (process.env.PG_OPERATIONS_CAPTURE === "1") {
    const screenshot = testInfo.outputPath("portfolio.png");
    await page.screenshot({ path: screenshot, animations: "disabled", scale: "css" });
    await testInfo.attach("portfolio", { path: screenshot, contentType: "image/png" });
  }
  await expect(page.getByRole("button", { name: "Disconnect Research wallet" })).toBeVisible();
});

test("portfolio disconnect needs confirmation and failed actions can be retried", async ({ page, backend }) => {
  await page.goto("/zh/portfolio");
  const button = page.getByRole("button", { name: "断开 Research wallet" });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "断开账户连接？" });
  await expect(dialog).toBeVisible();
  expect(backend.mutations).toEqual([]);
  await expect(dialog.getByRole("button", { name: "保留连接" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await button.click();
  backend.failMutation = true;
  await dialog.getByRole("button", { name: "断开连接", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  backend.failMutation = false;
  await dialog.getByRole("button", { name: "断开连接", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "已断开" })).toBeVisible();
});

test("portfolio rejects malformed public addresses and stays within the viewport", async ({ page, backend }) => {
  await page.goto("/en/portfolio");
  await expect(page.getByRole("button", { name: "Connect MetaMask", exact: true })).toBeDisabled();
  await page.getByLabel("Public wallet address", { exact: true }).fill("not-a-wallet");
  await page.getByRole("button", { name: "Connect Hyperliquid", exact: true }).click();
  await expect(page.getByText("Enter a public 0x address with 40 hexadecimal characters.", { exact: true })).toBeVisible();
  expect(backend.mutations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("usage filters request the selected model and key, and invalid ranges stay local", async ({ page, backend }) => {
  await page.goto("/en/gateway");
  const modelResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("model") === "offline-research");
  await page.getByRole("combobox", { name: "Filter by model", exact: true }).selectOption("offline-research");
  await modelResponse;
  await expect(page.getByRole("region", { name: "Gateway usage", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("combobox", { name: "Filter by model", exact: true })).toHaveValue("offline-research");
  await expect.poll(() => backend.reads.some((path) => path.includes("model=offline-research"))).toBe(true);
  const keyResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("api_key_id") === "offline-key");
  await page.getByRole("combobox", { name: "Filter by API key", exact: true }).selectOption("offline-key");
  await keyResponse;
  await expect(page.getByRole("region", { name: "Gateway usage", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("combobox", { name: "Filter by model", exact: true })).toHaveValue("offline-research");
  await expect(page.getByRole("combobox", { name: "Filter by API key", exact: true })).toHaveValue("offline-key");
  await expect.poll(() => backend.reads.some((path) => path.includes("model=offline-research") && path.includes("api_key_id=offline-key"))).toBe(true);
  await page.getByLabel("From", { exact: true }).fill("2026-02-02");
  await page.getByLabel("To", { exact: true }).fill("2026-02-01");
  const before = backend.reads.filter((path) => path.startsWith("/api/gateway/usage")).length;
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose an end date after the start date." })).toBeVisible();
  expect(backend.reads.filter((path) => path.startsWith("/api/gateway/usage")).length).toBe(before);
});

test("checkout result pages keep payment and subscription status honest", async ({ page }) => {
  for (const locale of ["en", "zh"]) {
    await page.goto(`/${locale}/billing/success`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Payment pending confirmation" : "付款状态待确认");
    await expect(page.locator("body")).not.toContainText(locale === "en" ? "Payment received." : "付款已收到");
    await page.goto(`/${locale}/billing/cancel`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Checkout cancelled" : "已退出本次结账");
    await expect(page.locator("body")).toContainText(locale === "en" ? "existing subscription has not been cancelled" : "不会因此取消现有订阅");
  }
});


test("failed sync releases busy and preserves the last snapshot until a successful retry", async ({ page, backend }) => {
  await page.goto("/en/portfolio");
  await expect(page.getByTestId("portfolio-nav")).toHaveText("$0.00");
  backend.failMutation = true;
  backend.failPortfolio = true;
  await page.getByRole("button", { name: "Sync all", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load your portfolio" })).toBeVisible();
  await expect(page.getByTestId("portfolio-nav")).toHaveText("$0.00");
  backend.failMutation = false;
  backend.failPortfolio = false;
  await page.getByRole("button", { name: "Retry portfolio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sync all", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load your portfolio" })).toHaveCount(0);
});


test("dashboard portfolio summaries distinguish unavailable, zero and negative NAV", async ({ page, backend }) => {
  backend.failPortfolio = true;
  await page.goto("/en/dashboard");
  const summary = page.getByTestId("dashboard-portfolio-nav");
  const activity = page.getByTestId("dashboard-portfolio-snapshot");
  await expect(summary).toHaveText("—");
  await expect(activity).toHaveText("—");
  await expect(page.getByText("Portfolio data unavailable — try again later", { exact: true })).toBeVisible();
  await expect(page.getByText("Agent activity is unavailable.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry Agent activity", exact: true }).click();
  await expect(page.getByText("Agent activity is unavailable.", { exact: true })).toBeVisible();
  backend.failPortfolio = false;
  await page.reload();
  await expect(summary).toHaveText("$0.00");
  await expect(activity).toHaveText("$0.00");
  backend.nav = -5;
  await page.reload();
  await expect(summary).toHaveText("$-5.00");
  await expect(activity).toHaveText("$-5.00");
});
