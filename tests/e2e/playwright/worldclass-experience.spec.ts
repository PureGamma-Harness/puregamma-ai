import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { test, conversation, user } from "./worldclass-fixtures";

function composer(page: Page) {
  // Streaming SSR can temporarily stage transport copies outside the landmark.
  return page.getByRole("main").getByTestId("chat-composer-input");
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

async function inViewport(control: Locator, page: Page) {
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: "image/png" });
}

async function measurements(info: TestInfo, name: string, value: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2));
  await info.attach(name, { path, contentType: "application/json" });
}

test("Dashboard questions arrive as exact editable bilingual drafts without sending", async ({ page, backend }) => {
  for (const locale of ["en", "zh"] as const) {
    await page.goto(`/${locale}/dashboard`);
    const question = locale === "zh" ? "  核验 BTC + ETH：风险 & 资料来源？😀  " : "  Compare BTC + ETH: evidence & risks? 中文 😀  ";
    const input = page.getByRole("textbox", { name: locale === "zh" ? "向 PureGamma 提问" : "Ask PureGamma", exact: true });
    await expect(input).toBeVisible();
    await input.fill(question);
    const quotesBefore = backend.quoteRequests.length;
    await page.getByRole("button", { name: locale === "zh" ? "打开对话" : "Open a conversation", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/chat\\?topic=`));
    const url = new URL(page.url());
    expect(url.searchParams.get("topic")).toBe(question.trim());
    expect(url.searchParams.has("prompt")).toBe(false);
    await expect(composer(page)).toBeEnabled();
    await expect(composer(page)).toHaveValue(question.trim());
    // Wait for the real, non-chargeable draft-estimation path, which the
    // fixture explicitly declines. The handoff never starts a message run.
    await expect.poll(() => backend.quoteRequests.length).toBeGreaterThan(quotesBefore);
    await composer(page).fill(`${question.trim()} — edited`);
    await expect(composer(page)).toHaveValue(`${question.trim()} — edited`);
    expect(backend.reads.filter(read => read.method === "POST" && read.path.endsWith("/messages"))).toEqual([]);
    await noOverflow(page);
  }
  // Suggestion chips are intentionally absent below 768px; both phone handoffs
  // above exercise the visible question field. Exercise chips where available.
  if (page.viewportSize()!.width >= 768) {
    await page.goto("/zh/dashboard");
    await page.getByRole("button", { name: "BTC 市场观察", exact: true }).click();
    await expect(composer(page)).toBeEnabled();
    await expect(composer(page)).toHaveValue("今天 BTC 有哪些重要变化？请列出支持这些变化的来源。");
    expect(new URL(page.url()).searchParams.get("topic")).toBe("今天 BTC 有哪些重要变化？请列出支持这些变化的来源。");
  }
  expect(backend.reads.filter(read => read.method !== "GET")).toEqual([]);
});

test("topic precedence, ambiguous arrays and Unicode limits are enforced by the real route", async ({ page, backend }) => {
  const limitInput = `${"a".repeat(3999)}😀Z`;
  const cases = [
    { query: new URLSearchParams({ prompt: "  legacy 中文 + &  " }), expected: "legacy 中文 + &" },
    { query: new URLSearchParams({ topic: "  canonical 中文 😀  ", prompt: "ignored legacy" }), expected: "canonical 中文 😀" },
    { query: new URLSearchParams({ topic: " \t\n ", prompt: "must not replace blank topic" }), expected: "" },
    { query: new URLSearchParams([["topic", "first"], ["topic", "second"], ["prompt", "must not replace array"]]), expected: "" },
    { query: new URLSearchParams([["prompt", "first"], ["prompt", "second"]]), expected: "" },
    { query: new URLSearchParams({ topic: "　中文换行\n+ & 😀　" }), expected: "中文换行\n+ & 😀" },
    // An astral symbol at the boundary proves code points, not UTF-16 units.
    { query: new URLSearchParams({ topic: limitInput }), expected: `${"a".repeat(3999)}😀` },
  ];
  for (const entry of cases) {
    const quotesBefore = backend.quoteRequests.length;
    await page.goto(`/en/chat?${entry.query}`);
    await expect(composer(page)).toBeEnabled();
    await expect(composer(page)).toHaveValue(entry.expected);
    if (entry.expected) await expect.poll(() => backend.quoteRequests.length).toBeGreaterThan(quotesBefore);
    expect(backend.reads.filter(read => read.method === "POST" && read.path.endsWith("/messages"))).toEqual([]);
  }
  expect(Array.from(await composer(page).inputValue())).toHaveLength(4000);
  await noOverflow(page);
});

test("native page search filters real destinations and supports keyboard navigation and focus return", async ({ page }) => {
  await page.goto("/en/research");
  const trigger = page.getByTestId("workspace-search-trigger");
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search workspace pages", exact: true });
  const query = dialog.getByRole("combobox", { name: "Page name", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element instanceof HTMLDialogElement && element.open && element.matches(":modal"))).toBe(true);
  await expect(query).toBeFocused();
  await expect(dialog.getByRole("option", { name: "Dashboard", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("option", { name: "Agent", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await expect(dialog.getByRole("option", { name: "Dashboard", exact: true })).toHaveAttribute("aria-selected", "true");
  await query.fill("no page has this exact phrase 94261");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog.getByText("No matching pages. Try a different name.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Meta+k");
  await expect(query).toBeFocused();
  await expect(query).toHaveValue("");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/chat$/);
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await page.goto("/zh/research");
  await page.getByRole("button", { name: "查找页面", exact: true }).click();
  const chinese = page.getByRole("dialog", { name: "搜索工作区页面", exact: true });
  await chinese.getByRole("combobox", { name: "页面名称", exact: true }).fill("报告");
  await expect(chinese.getByRole("option", { name: "报告", exact: true })).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/zh\/reports$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "研究报告", level: 1, exact: true })).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await noOverflow(page);
});

test("account loading, unknown credits and confirmed zero retain honest refresh states", async ({ page, backend }) => {
  await page.addInitScript(() => localStorage.setItem("pg_user", JSON.stringify({ id: "old-cache", name: "Cached identity", plan: "Free", credit_balance: 0 })));
  let releaseIdentity!: () => void;
  const pending = new Promise<void>(resolve => { releaseIdentity = resolve; });
  backend.handlers.set("GET /me", async () => { await pending; return { body: { user: { id: user.id, name: user.name, email: user.email } } }; });
  try {
    await page.goto("/en/research");
    const summary = page.getByTestId("account-summary");
    await expect.poll(() => backend.reads.filter(read => read.path === "/me").length).toBeGreaterThan(0);
    await expect(summary).toHaveAttribute("data-account-state", "loading");
    await expect(summary).toHaveText("Loading account…");
    await expect(summary.getByRole("link")).toHaveCount(0);
    await expect(summary.getByTestId("account-credits")).toHaveCount(0);
    releaseIdentity();
    await expect(summary).toHaveAttribute("data-account-state", "known");
    await expect(summary.getByTestId("account-credits")).toHaveText("Credits unavailable");
    await expect(summary).not.toContainText("Free");

    backend.handlers.set("GET /me", () => ({ body: { user: { ...user, credit_balance: 0 } } }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(summary.getByTestId("account-credits")).toHaveText("0 credits");
    await expect(summary).toHaveAttribute("data-account-state", "known");
    backend.handlers.set("GET /me", () => ({ status: 503, body: { detail: "Identity temporarily unavailable" } }));
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/me") && response.status() === 503),
      page.evaluate(() => window.dispatchEvent(new Event("focus"))),
    ]);
    await expect(summary).toHaveAttribute("data-account-state", "known");
    await expect(summary.getByTestId("account-credits")).toHaveText("0 credits");
    if (page.viewportSize()!.width >= 1024) await expect(summary.getByRole("link", { name: "Open account: Researcher", exact: true })).toBeVisible();
    else {
      // Account facts are intentionally absent from the compact phone header;
      // this branch verifies stored state without claiming a visible control.
      await expect(summary).toBeHidden();
      await expect(summary.locator('a[href="/en/account"]')).toHaveCount(1);
    }

    backend.handlers.set("GET /me", () => ({ body: { user: { ...user, has_password: true, credit_balance: 0 } } }));
    backend.handlers.set("GET /api/agent/quota", () => ({ body: { used: 0, limit: null, remaining: null, credit_balance: 0 } }));
    for (const locale of ["en", "zh"] as const) {
      await page.goto(`/${locale}/account`);
      const main = page.getByRole("main");
      const usage = main.getByRole("heading", { name: "Agent", exact: true, level: 2 }).locator("..");
      const usedCell = usage.getByText(locale === "zh" ? "已用" : "Used", { exact: true }).locator("..");
      const remainingCell = usage.getByText(locale === "zh" ? "剩余" : "Remaining", { exact: true }).locator("..");
      const creditCell = usage.getByText("Credits", { exact: true }).locator("..");
      await expect(usedCell.getByText("0", { exact: true })).toBeVisible();
      await expect(remainingCell.getByText("—", { exact: true })).toBeVisible();
      await expect(remainingCell.getByText(locale === "zh" ? "不限" : "No limit", { exact: true })).toHaveCount(0);
      await expect(remainingCell.getByText("0", { exact: true })).toHaveCount(0);
      await expect(creditCell.getByText("0", { exact: true })).toBeVisible();
      const currentLabel = locale === "zh" ? "当前密码" : "Current password";
      const newLabel = locale === "zh" ? "新密码" : "New password";
      const currentPassword = main.getByLabel(currentLabel, { exact: true });
      const newPassword = main.getByLabel(newLabel, { exact: true });
      await main.getByText(currentLabel, { exact: true }).click();
      await expect(currentPassword).toBeFocused();
      await currentPassword.fill("offline-current-password");
      await newPassword.fill("offline-new-password");
      await expect(currentPassword).toHaveValue("offline-current-password");
      await expect(newPassword).toHaveValue("offline-new-password");
      const address = main.getByLabel(locale === "zh" ? "iMessage 手机号或 Apple ID 邮箱" : "iMessage phone number or Apple ID email", { exact: true });
      await address.fill("researcher@example.invalid");
      await expect(address).toHaveValue("researcher@example.invalid");
      // A verification challenge requires an explicit POST, which this suite
      // never initiates. Its fourth labeled field must stay absent beforehand.
      await expect(main.getByLabel(locale === "zh" ? "验证码" : "Verification code", { exact: true })).toHaveCount(0);
      await noOverflow(page);
    }

    backend.handlers.set("GET /me", () => ({ body: { user: { id: user.id, name: user.name, email: user.email, has_password: true } } }));
    backend.handlers.set("GET /api/agent/quota", () => ({ body: {} }));
    await page.goto("/en/account");
    const unknownUsage = page.getByRole("main").getByRole("heading", { name: "Agent", exact: true, level: 2 }).locator("..");
    for (const label of ["Used", "Remaining", "Credits"]) {
      const cell = unknownUsage.getByText(label, { exact: true }).locator("..");
      await expect(cell.getByText("—", { exact: true })).toBeVisible();
      await expect(cell.getByText("0", { exact: true })).toHaveCount(0);
    }
    backend.handlers.set("GET /me", () => ({ body: { user: { ...user, has_password: true, credit_balance: 0 } } }));
    backend.handlers.set("GET /api/agent/quota", () => ({ body: { used: 0, limit: 0, remaining: 0, credit_balance: 0 } }));
    await page.reload();
    const zeroUsage = page.getByRole("main").getByRole("heading", { name: "Agent", exact: true, level: 2 }).locator("..");
    for (const label of ["Used", "Remaining", "Credits"]) await expect(zeroUsage.getByText(label, { exact: true }).locator("..").getByText("0", { exact: true })).toBeVisible();
  } finally { releaseIdentity(); }
});

test("a real quota payload cannot promote cached identity while every identity read is pending", async ({ page, backend }) => {
  await page.addInitScript(() => localStorage.setItem("pg_user", JSON.stringify({ id: "cached-user", name: "Cached identity", email: "cached@example.invalid", plan: "Free", credit_balance: 0 })));
  let releaseIdentity!: () => void;
  const pending = new Promise<void>(resolve => { releaseIdentity = resolve; });
  backend.handlers.set("GET /me", async () => { await pending; return { body: { user } }; });
  try {
    await page.goto("/en/chat");
    // The actual Agent capability read publishes its quota through production
    // user-state code. Its merged cached id/email must not confirm identity.
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pg_user") || "{}").credit_balance)).toBe(100);
    const summary = page.getByTestId("account-summary");
    await expect(summary).toHaveAttribute("data-account-state", "loading");
    await expect(summary).toHaveText("Loading account…");
    await expect(summary.getByRole("link")).toHaveCount(0);
    await expect(summary.getByTestId("account-credits")).toHaveCount(0);
    releaseIdentity();
    await expect(summary).toHaveAttribute("data-account-state", "known");
    if (page.viewportSize()!.width >= 1024) await expect(summary.getByRole("link", { name: "Open account: Researcher", exact: true })).toBeVisible();
    else {
      await expect(summary).toBeHidden();
      await expect(summary.locator('a[href="/en/account"]')).toHaveCount(1);
    }
    await expect(composer(page)).toBeEnabled();
  } finally { releaseIdentity(); }
});

test("research reaches actual work early and completed output precedes disclosed process", async ({ page }, info) => {
  await page.goto("/en/research");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("heading", { name: "Research", exact: true, level: 1 })).toBeVisible();
  const firstRun = main.getByRole("link", { name: /BTC funding evidence/ });
  await expect(firstRun).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const firstBounds = await firstRun.boundingBox();
  expect(firstBounds).not.toBeNull();
  expect(firstBounds!.y).toBeLessThanOrEqual(page.viewportSize()!.width < 1024 ? 400 : 320);
  await measurements(info, "research-first-result-geometry", { viewport: page.viewportSize(), firstRun: firstBounds });
  await inViewport(main.getByRole("button", { name: "New research run", exact: true }), page);
  await capture(page, info, "research-first-viewport");
  await firstRun.click();
  await expect(page).toHaveURL(/\/en\/research\/run-btc$/);
  const artifact = main.getByRole("heading", { name: "Complete research artifact", exact: true, level: 3 });
  await expect(artifact).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByText("The full research body is readable here.", { exact: true })).toBeVisible();
  const process = main.locator("summary").filter({ hasText: "View research process" });
  await expect(process).toHaveCount(1);
  expect(await artifact.evaluate((element, processElement) => !!(element.compareDocumentPosition(processElement as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await process.elementHandle())).toBe(true);
  await expect(process.locator("..")).not.toHaveAttribute("open", "");
  await expect(main.getByRole("link", { name: "Recorded funding snapshot", exact: true })).toHaveAttribute("href", "https://example.com/funding");
  await expect(main.getByText("Recorded funding rate: 0.01%.", { exact: true })).toBeVisible();
  await capture(page, info, "completed-research-first-viewport");
  await noOverflow(page);
});

test("a held research detail module commits useful loading and keeps page search usable", async ({ page, backend }, info) => {
  const locale = info.project.name === "mobile-chrome" ? "zh" : "en";
  let releaseChunk!: () => void;
  const heldChunk = new Promise<void>(resolve => { releaseChunk = resolve; });
  let requestedChunk = "";
  // Hold the actual generated page module, including an automatic prefetch.
  // Other research modules and all shared shell code remain unmodified.
  await page.route("**/_next/static/chunks/app/**/research/**/page-*.js", async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (!/\/_next\/static\/chunks\/app\/\[locale\]\/research\/\[runId\]\/page-[^/]+\.js$/.test(pathname)) return route.fallback();
    requestedChunk = pathname;
    await heldChunk;
    await route.fallback();
  });
  const main = page.getByRole("main");
  try {
    await page.goto(`/${locale}/research`);
    const firstRun = main.getByRole("link", { name: /BTC funding evidence/ });
    await expect(firstRun).toBeVisible();
    await firstRun.click();
    await expect.poll(() => requestedChunk).toMatch(/\/research\/\[runId\]\/page-/);
    await expect(page).toHaveURL(new RegExp(`/${locale}/research/run-btc$`));
    const loading = main.getByRole("status").filter({ hasText: locale === "zh" ? "正在加载工作区…" : "Loading your workspace…" });
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    expect(backend.reads.filter(read => /^\/api\/research\/runs\/run-btc(?:\/|$)/.test(read.path))).toEqual([]);
    const trigger = page.getByTestId("workspace-search-trigger");
    await trigger.click();
    const search = page.getByRole("dialog", { name: locale === "zh" ? "搜索工作区页面" : "Search workspace pages", exact: true });
    await expect(search).toBeVisible();
    await expect(search.getByRole("combobox", { name: locale === "zh" ? "页面名称" : "Page name", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(search).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(loading).toBeVisible();
    await capture(page, info, "research-detail-module-held");
  } finally { releaseChunk(); }
  await expect(main.getByRole("heading", { name: "Complete research artifact", exact: true, level: 3 })).toBeVisible();
  await expect(main.getByText("The full research body is readable here.", { exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Recorded funding snapshot", exact: true })).toHaveAttribute("href", "https://example.com/funding");
  await expect(main.getByText("Recorded funding rate: 0.01%.", { exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await noOverflow(page);
});

test("report deep links lead with the reader and archive return preserves search and selection", async ({ page }, info) => {
  await page.goto("/en/reports?report=report-eth&origin=fixture");
  const main = page.getByRole("main");
  const title = main.locator("#selected-report-title");
  await expect(title).toHaveText("ETH portfolio review");
  await expect(title).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("heading", { name: "ETH findings", exact: true, level: 3 })).toBeVisible();
  const phone = page.viewportSize()!.width < 1024;
  const bounds = await title.boundingBox();
  expect(bounds).not.toBeNull();
  if (phone) expect(bounds!.y).toBeLessThanOrEqual(300);
  else expect((await main.locator("#report-detail").boundingBox())!.width).toBeGreaterThanOrEqual(640);
  await measurements(info, "report-deep-link-geometry", { viewport: page.viewportSize(), title: bounds, reader: await main.locator("#report-detail").boundingBox() });
  await capture(page, info, "report-deep-link-first-viewport");
  const search = main.getByLabel("Search reports by title or asset", { exact: true });
  if (phone) {
    await expect(search).toBeHidden();
    await main.getByRole("button", { name: "Back to archive", exact: true }).click();
    await expect(search).toBeFocused();
  }
  await search.fill("BTC");
  await expect(main.getByRole("button", { name: /ETH portfolio review/ })).toHaveCount(0);
  await main.getByRole("button", { name: /BTC evidence brief/ }).click();
  await expect(title).toHaveText("BTC evidence brief");
  await expect(title).toBeVisible();
  await expect(page).toHaveURL(/report=report-btc/);
  expect(new URL(page.url()).searchParams.get("origin")).toBe("fixture");
  await expect(main.getByRole("heading", { name: "BTC findings", exact: true, level: 3 })).toBeVisible();
  await expect(main.getByText("Recorded funding evidence does not establish a price forecast.", { exact: true })).toBeVisible();
  if (phone) {
    await expect(title).toBeFocused();
    await main.getByRole("button", { name: "Back to archive", exact: true }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("BTC");
    await expect(main.getByRole("button", { name: /BTC evidence brief/ })).toHaveAttribute("aria-pressed", "true");
  }
  await noOverflow(page);
});

test("empty and populated Agent workspaces keep their title and composer reachable with native history", async ({ page, backend }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/en/chat/c1");
  const main = page.getByRole("main");
  await expect(composer(page)).toBeEnabled();
  await expect(main.getByRole("heading", { name: conversation.title, exact: true, level: 1 })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("heading", { name: "Recorded funding review", exact: true, level: 2 })).toHaveCount(1);
  await expect(main.getByRole("link", { name: /Recorded funding snapshot/ })).toHaveAttribute("href", "https://example.com/funding");
  await expect(main.getByText("Actual cost: 2 Credits", { exact: true })).toBeVisible();
  await inViewport(main.getByRole("heading", { level: 1 }), page);
  await inViewport(composer(page), page);
  await inViewport(main.getByRole("button", { name: "Send", exact: true }), page);
  await measurements(info, "populated-agent-geometry", { viewport: page.viewportSize(), title: await main.getByRole("heading", { level: 1 }).boundingBox(), composer: await composer(page).boundingBox(), send: await main.getByRole("button", { name: "Send", exact: true }).boundingBox() });
  expect(await main.getByTestId("chat-transcript").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await noOverflow(page);
  await capture(page, info, "populated-agent-first-viewport");

  if (page.viewportSize()!.width >= 1280) {
    await main.getByRole("button", { name: "Collapse conversation history", exact: true }).click();
    await expect(main.getByRole("button", { name: "Expand conversation history", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const historyTrigger = main.getByTestId("chat-history-trigger");
  await historyTrigger.click();
  const history = main.getByRole("dialog", { name: "Conversation history", exact: true });
  await expect(history).toBeVisible();
  expect(await history.evaluate(element => element instanceof HTMLDialogElement && element.matches(":modal"))).toBe(true);
  await page.keyboard.press("Control+k");
  await expect(history).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "Search workspace pages", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(history).toBeHidden();
  await expect(historyTrigger).toBeFocused();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await composer(page).fill("An editable follow-up question");
  await expect(main.getByRole("heading", { name: conversation.title, exact: true, level: 1 })).toBeVisible();
  await inViewport(composer(page), page);
  await noOverflow(page);

  backend.handlers.set("GET /api/agent/conversations", () => ({ body: { conversations: [] } }));
  await page.goto("/zh/chat");
  await expect(composer(page)).toBeEnabled();
  await expect(main.getByRole("heading", { name: "Agent 对话", exact: true, level: 1 })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("heading", { name: "从一个值得追问的问题开始。", level: 2, exact: true })).toBeVisible();
  await inViewport(composer(page), page);
  await inViewport(main.getByRole("button", { name: "发送", exact: true }), page);
  await noOverflow(page);
  await capture(page, info, "empty-agent-phone-first-viewport");
  expect(backend.reads.filter(read => read.method !== "GET")).toEqual([]);
});

test("unavailable research, reports and account facts remain distinct from empty or signed out", async ({ page, backend }) => {
  backend.handlers.set("GET /me", () => ({ status: 503, body: { detail: "Identity unavailable" } }));
  backend.handlers.set("GET /api/research/runs", () => ({ status: 503, body: { detail: "Research unavailable" } }));
  backend.handlers.set("GET /reports", () => ({ status: 503, body: { detail: "Reports unavailable" } }));
  await page.goto("/en/research");
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "Service error" })).toBeVisible();
  await expect(page.getByText("Start with a good question.", { exact: true })).toHaveCount(0);
  const account = page.getByTestId("account-summary");
  await expect(account).toHaveAttribute("data-account-state", "unavailable");
  await expect(account).toHaveText("Account unavailable");
  await expect(account.getByTestId("account-credits")).toHaveCount(0);
  await expect(account.getByRole("link", { name: /Sign up|Sign in/ })).toHaveCount(0);
  await page.goto("/en/reports");
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "This does not mean your saved reports are empty" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry loading reports", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
  await noOverflow(page);
});
