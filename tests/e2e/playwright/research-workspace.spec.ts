import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test as base, type Page } from "@playwright/test";

type Reply = { status?: number; body: unknown };
type Read = { method: string; path: string; query: URLSearchParams; body: string };
type Handler = (read: Read) => Reply | Promise<Reply>;
type Backend = { origin: string; authority: string; reads: Read[]; handlers: Map<string, Handler> };
const now = new Date(Date.now() - 60_000).toISOString();
const run = { id: "run-btc", name: "BTC funding evidence", status: "completed", created_at: now, updated_at: now, data_sources: ["market", "news"], evidence_count: 1, summary: "Funding alone does not establish a price forecast." };
const conversation = { id: "c1", title: "Primary research", status: "active", created_at: now, updated_at: now, permission_mode: "workspace-write" };
const quota = { remaining: 10, limit: 20, credit_balance: 100 };
const capabilities = { plan: "Pro", allowed_data_sources: ["market", "rss"], allowed_skills: [], max_attachments: 5 };
const reports = [
  { id: "report-btc", title: "BTC evidence brief", report_type: "daily_market_report", content_markdown: "## BTC findings\n\nA recorded research brief.", assets: ["BTC"], created_at: now, language: "en", source_intelligence_id: "evidence-1" },
  { id: "report-eth", title: "ETH portfolio review", report_type: "portfolio_report", content_markdown: "## ETH findings\n\nA separate portfolio review.", assets: ["ETH"], created_at: now, language: "en" },
];
const settings = { short_term_enabled: true, mid_term_enabled: false, conversation_summary_enabled: false, research_memory_enabled: false, portfolio_memory_enabled: false, retention_days: 30 };
function news(title: string) { return { items: [{ id: title, title, summary: "A short attributed summary.", kind: "flash", attribution: "Offline source", symbols: [], published_at: now, age_seconds: 60, url: "https://example.com/source" }], page: { limit: 30, has_more: false, next_cursor: null }, meta: { status: "ok", refresh_after_seconds: 600, last_success_at: now, language_fallback: false } }; }

const test = base.extend<{ backend: Backend; errors: string[] }>({
  backend: async ({}, use) => {
    const handlers = new Map<string, Handler>();
    const reads: Read[] = [];
    const server = createServer(async (request: IncomingMessage, response) => {
      const url = new URL(request.url || "/", "http://offline.invalid");
      const path = url.pathname.replace(/^\/(?:__dev-api|api)(?=\/)/, "");
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const read = { method: request.method || "GET", path, query: url.searchParams, body: Buffer.concat(chunks).toString() };
      reads.push(read);
      let result: Reply;
      try {
        const handler = handlers.get(`${read.method} ${path}`);
        if (handler) result = await handler(read);
        else if (path === "/me") result = { body: { user: { id: "offline-user", role: "user", name: "Researcher", email: "research@example.invalid", plan: "Pro", credit_balance: 100 } } };
        else if (path === "/api/frontend/plugins") result = { body: { plugins: [], capabilities } };
        else if (path === "/auth/x/config") result = { body: { x_login_enabled: false } };
        else if (path === "/gateway/catalog") result = { body: { models: [], default_model: "default", unavailable: false } };
        else if (path === "/api/agent/capabilities") result = { body: { capabilities, quota, models: [{ id: "default", display_name: "Offline model", available: true }], skills: [] } };
        else if (path === "/api/agent/workspace-capabilities") result = { body: { max_file_bytes: 1048576, max_files: 5, file_types: ["txt", "md", "png"] } };
        else if (path === "/api/agent/quota") result = { body: quota };
        else if (path === "/api/agent/quote") result = { body: { estimated_min: 1, estimated_max: 2 } };
        else if (path === "/api/agent/conversations") result = { body: { conversations: [conversation] } };
        else if (path === "/api/agent/conversations/c1") result = { body: { conversation, messages: [] } };
        else if (path === "/api/research/runs") result = { body: { runs: [run], total: 1 } };
        else if (path === "/api/research/runs/run-btc") result = { body: { run } };
        else if (path === "/api/research/runs/run-btc/evidence") result = { body: { evidence: [{ id: "e1", citation_index: 1, title: "Recorded funding snapshot", provider: "Offline exchange", excerpt: "Recorded funding rate: 0.01%.", fetched_at: now, url: "https://example.com/funding", is_verified: true }] } };
        else if (path === "/api/research/runs/run-btc/artifacts") result = { body: { artifacts: [{ id: "a1", title: "Funding review", type: "report", markdown: "## Complete research artifact\n\nThe full research body is readable here." }] } };
        else if (path === "/api/memory/settings") result = { body: { settings } };
        else if (path === "/api/memory/items") result = { body: { items: [], total: 0 } };
        else if (path === "/api/memory/proposals") result = { body: { proposals: [] } };
        else if (path === "/reports") result = { body: { reports, unavailable: false } };
        else if (path === "/api/news") result = { body: news("Initial market news") };
        else result = { status: 404, body: { detail: "Not provided by this offline fixture" } };
      } catch { result = { status: 500, body: { detail: "Offline fixture failure" } }; }
      if (!response.destroyed) { response.writeHead(result.status || 200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(result.body)); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const authority = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    try { await use({ origin: `http://${authority}`, authority, reads, handlers }); }
    finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  },
  errors: async ({ page, context, baseURL, backend }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.addCookies([{ name: "pg_session", value: "offline-research", url: baseURL! }]);
    await page.setExtraHTTPHeaders({ "x-forwarded-host": backend.authority, "x-forwarded-proto": "http" });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) return route.abort();
      if (/^\/(?:api|__dev-api)\//.test(url.pathname)) return route.fulfill({ response: await route.fetch({ url: `${backend.origin}${url.pathname}${url.search}` }) });
      return route.continue();
    });
    await page.routeWebSocket("**/*", socket => socket.close());
    try { await use(errors); expect(errors).toEqual([]); }
    finally {
      // Settle proxy handlers and close their page before the dependent server
      // fixture is disposed, including deferred quote/identity requests.
      await page.unrouteAll({ behavior: "wait" });
      await page.close();
    }
  },
});

async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1); }

function chatComposer(page: Page) {
  // Fizz may temporarily stage a second copy outside the rendered landmark.
  // Keep strict matching within the workspace the user can interact with.
  return page.getByRole("main").getByTestId("chat-composer-input");
}

test("research loading failures remain distinct from an empty list and retry once", async ({ page, backend, errors }) => {
  let calls = 0;
  backend.handlers.set("GET /api/research/runs", () => ++calls === 1 ? { status: 503, body: { detail: "Unavailable" } } : { body: { runs: [run], total: 1 } });
  await page.goto("/en/research");
  await expect(page.getByRole("alert").filter({ hasText: "Service error" })).toContainText("Service error");
  await expect(page.getByText("Start with a good question.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("link", { name: /BTC funding evidence/ })).toBeVisible();
  expect(calls).toBe(2);
  await noOverflow(page); expect(errors).toEqual([]);
});

test("a labeled research draft survives rejection and opens its actual artifact", async ({ page, backend, errors }, info) => {
  let calls = 0;
  backend.handlers.set("POST /api/research/runs", read => {
    const payload = JSON.parse(read.body);
    expect(payload.prompt).toBe("Investigate BTC funding over 90 days");
    return ++calls === 1 ? { status: 429, body: { detail: { code: "HARNESS_QUOTA_EXCEEDED" } } } : { body: { run, created: true } };
  });
  await page.goto("/en/research");
  await page.getByRole("button", { name: "New research run", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Research question", exact: true })).toBeFocused();
  await page.getByRole("textbox", { name: "Research question", exact: true }).fill("Investigate BTC funding over 90 days");
  await page.getByRole("button", { name: "Start research", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "allowance" })).toContainText("allowance");
  await expect(page.getByRole("textbox", { name: "Research question", exact: true })).toHaveValue("Investigate BTC funding over 90 days");
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Start research", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/research\/run-btc$/);
  await expect(page.getByRole("link", { name: "Recorded funding snapshot" })).toHaveAttribute("href", "https://example.com/funding");
  await expect(page.getByText("Recorded funding rate: 0.01%.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Complete research artifact" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("research-evidence.png"), fullPage: true });
  await noOverflow(page); expect(calls).toBe(2); expect(errors).toEqual([]);
});

test("a failed refresh keeps the last loaded runs visibly stale", async ({ page, backend, errors }) => {
  let calls = 0;
  backend.handlers.set("GET /api/research/runs", () => ++calls === 1 ? { body: { runs: [run], total: 1 } } : { status: 503, body: { detail: "Unavailable" } });
  await page.goto("/en/research");
  await expect(page.getByRole("link", { name: /BTC funding evidence/ })).toBeVisible();
  await page.getByRole("button", { name: "Refresh research runs" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Showing the last loaded runs" })).toContainText("Showing the last loaded runs");
  await expect(page.getByRole("link", { name: /BTC funding evidence/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("memory read failures preserve privacy controls and cannot race a setting change", async ({ page, backend, errors }) => {
  let currentSettings = { ...settings };
  let failSettings = false;
  let releasePatch: (() => void) | undefined;
  backend.handlers.set("GET /api/memory/settings", () => failSettings ? { status: 503, body: { detail: "Unavailable" } } : { body: { settings: currentSettings } });
  backend.handlers.set("PATCH /api/memory/settings", async read => {
    await new Promise<void>(resolve => { releasePatch = resolve; });
    currentSettings = { ...currentSettings, ...JSON.parse(read.body) };
    return { body: { settings: currentSettings } };
  });
  backend.handlers.set("GET /api/memory/proposals", () => ({ status: 503, body: { detail: "Unavailable" } }));
  const settingReads = () => backend.reads.filter(read => read.method === "GET" && read.path === "/api/memory/settings").length;
  try {
    await page.goto("/en/memory");
    await expect(page.getByRole("alert").filter({ hasText: "Some memory data could not be loaded" })).toBeVisible();
    await expect(page.getByText("No proposals awaiting approval.", { exact: true })).toHaveCount(0);
    const shortTerm = page.getByRole("switch", { name: "Short-term memory" });
    const retry = page.getByRole("button", { name: "Retry loading memory" });
    // Retain a known-on setting after a failed refresh, without inventing its
    // current value or blocking a privacy-restricting false PATCH.
    const beforeRefresh = settingReads();
    failSettings = true;
    await retry.click();
    await expect.poll(settingReads).toBeGreaterThan(beforeRefresh);
    await expect(page.getByText("Loading memory and proposals…", { exact: true })).toHaveCount(0);
    await expect(shortTerm).toBeEnabled();
    const beforeMutation = settingReads();
    await shortTerm.click();
    await expect.poll(() => !!releasePatch).toBe(true);
    await expect(retry).toBeDisabled();
    expect(settingReads()).toBe(beforeMutation);
    releasePatch?.();
    await expect(shortTerm).toHaveAttribute("aria-checked", "false");
    expect(settingReads()).toBe(beforeMutation);
    // Re-enabling waits for fresh settings; turning off did not.
    await expect(shortTerm).toBeDisabled();
    failSettings = false;
    backend.handlers.delete("GET /api/memory/proposals");
    await retry.click();
    await expect(page.getByText("No proposals awaiting approval.", { exact: true })).toBeVisible();
    await expect(shortTerm).toBeEnabled();
    await expect(shortTerm).toHaveAttribute("aria-checked", "false");
    await noOverflow(page); expect(errors).toEqual([]);
  } finally { releasePatch?.(); }
});

test("report deep links, search and mobile reading retain the selected result", async ({ page, errors }, info) => {
  await page.goto("/en/reports?report=report-eth");
  await expect(page.locator("#report-detail").getByRole("heading", { name: "ETH portfolio review" })).toBeVisible();
  if ((page.viewportSize()?.width || 0) < 1024) {
    await page.getByRole("button", { name: "Back to archive", exact: true }).click();
    await expect(page.getByLabel("Search reports by title or asset")).toBeFocused();
  }
  await page.getByRole("button", { name: /BTC evidence brief/ }).click();
  await expect(page).toHaveURL(/report=report-btc/);
  if ((page.viewportSize()?.width || 0) < 1024) await expect(page.locator("#report-detail h2").first()).toBeFocused();
  await expect(page.locator("#report-detail").getByRole("heading", { name: "BTC findings" })).toBeVisible();
  if ((page.viewportSize()?.width || 0) < 1024) {
    await page.getByRole("button", { name: "Back to archive", exact: true }).click();
    await expect(page.getByLabel("Search reports by title or asset")).toBeFocused();
  }
  await page.getByLabel("Search reports by title or asset").fill("ETH");
  await expect(page.getByRole("button", { name: /ETH portfolio review/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /BTC evidence brief/ })).toHaveCount(0);
  if ((page.viewportSize()?.width || 0) < 1024) await page.getByRole("button", { name: /ETH portfolio review/ }).click();
  await expect(page.locator("#report-detail").getByRole("heading", { name: "ETH portfolio review" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("report-reader.png"), fullPage: true });
  await noOverflow(page); expect(errors).toEqual([]);
});

test("an unavailable report archive is not represented as zero saved reports", async ({ page, backend, errors }) => {
  backend.handlers.set("GET /reports", () => ({ status: 503, body: { detail: "Unavailable" } }));
  await page.goto("/en/reports");
  await expect(page.getByRole("alert").filter({ hasText: "This does not mean your saved reports are empty" })).toContainText("This does not mean your saved reports are empty");
  await expect(page.getByRole("button", { name: "Retry loading reports" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("failed history deletion preserves the conversation and remains visible", async ({ page, backend, errors }) => {
  backend.handlers.set("DELETE /api/agent/conversations/c1", () => ({ status: 503, body: { detail: "Unavailable" } }));
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/en/chat");
  await expect(chatComposer(page)).toBeEnabled();
  const mobileHistory = (page.viewportSize()?.width || 0) < 1280;
  if (mobileHistory) await page.getByTestId("chat-history-trigger").click();
  // The desktop rail and native mobile dialog share their content. Assert the
  // actual open panel, rather than the first hidden copy of its error message.
  const history = page.getByRole("main").getByRole(mobileHistory ? "dialog" : "complementary", { name: "Conversation history", exact: true });
  await expect(history).toBeVisible();
  const remove = history.getByRole("button", { name: "Delete conversation: Primary research", exact: true });
  await remove.focus(); await expect(remove).toBeFocused(); await expect(remove).toBeVisible(); await remove.click();
  await expect(history.getByRole("button", { name: /^Primary research/ })).toBeVisible();
  const noticeScope = mobileHistory ? history : page.getByRole("main").getByRole("region", { name: "Current conversation", exact: true });
  const notice = "Conversation history could not be updated. Your existing content is kept; please try again.";
  await expect(noticeScope.getByRole("alert").filter({ hasText: notice })).toBeVisible();
  await expect(noticeScope.getByText(notice, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a pre-stream send failure restores a draft without automatic replay", async ({ page, backend, errors }) => {
  let sends = 0;
  backend.handlers.set("POST /api/agent/conversations/c1/messages", () => { sends += 1; return { status: 503, body: { detail: "Unavailable" } }; });
  await page.goto("/en/chat?topic=Compare%20BTC%20funding%20sources");
  const composer = chatComposer(page);
  await expect(composer).toBeEnabled(); await expect(composer).toHaveValue("Compare BTC funding sources");
  await composer.press("Enter");
  await expect(page.getByTestId("chat-error")).toBeVisible();
  await expect(composer).toHaveValue("Compare BTC funding sources");
  await page.waitForTimeout(300); expect(sends).toBe(1);
  expect(errors).toEqual([]);
});

test("a first send keeps its transaction when native history assigns the conversation URL", async ({ page, backend, errors }, info) => {
  const locale = info.project.name === "mobile-chrome" ? "zh" : "en";
  const first = { ...conversation, id: "first-created", title: "First owned conversation" };
  const question = "Keep this first-send transaction after its URL is assigned.";
  const answer = "# First response after URL assignment\n\nThe complete owned answer remains visible.";
  const source = { citation_index: 1, provider: "Owned fixture", title: "First-send source", url: "https://example.com/first-send", fetched_at: now, published_at: null, source_timestamp: now };
  const savedMessages = [
    { id: "first-user", conversation_id: first.id, role: "user", content: question, status: "completed", input_tokens: 8, output_tokens: 0, created_at: now, sources: [] },
    { id: "first-assistant", conversation_id: first.id, role: "assistant", content: answer, status: "completed", model: "default", input_tokens: 8, output_tokens: 24, credits_used: 2, credits_refunded: false, created_at: now, sources: [source] },
  ];
  let created = false;
  let completed = false;
  let releasePermission!: () => void;
  let releaseMessage!: () => void;
  const permissionGate = new Promise<void>(resolve => { releasePermission = resolve; });
  const messageGate = new Promise<void>(resolve => { releaseMessage = resolve; });
  let messagePosts = 0;
  backend.handlers.set("GET /me", () => ({ body: { user: { id: "offline-user", role: "user", name: "Researcher", email: "research@example.invalid", plan: "Pro", credit_balance: completed ? 98 : 100 } } }));
  backend.handlers.set("GET /api/agent/conversations", () => ({ body: { conversations: created ? [first] : [] } }));
  backend.handlers.set("POST /api/agent/conversations", () => { created = true; return { body: { conversation: first } }; });
  backend.handlers.set("PATCH /api/agent/conversations/first-created", async () => { await permissionGate; return { body: { conversation: first } }; });
  backend.handlers.set("GET /api/agent/conversations/first-created", () => ({ body: { conversation: first, messages: completed ? savedMessages : [] } }));
  backend.handlers.set("GET /api/agent/capabilities", () => ({ body: { capabilities, quota: { ...quota, credit_balance: completed ? 98 : 100 }, models: [{ id: "default", display_name: "Offline model", available: true }], skills: [] } }));
  backend.handlers.set("GET /api/agent/quota", () => ({ body: { ...quota, credit_balance: completed ? 98 : 100 } }));
  // The owned response crosses the real fetch/SSE parser after the URL rename.
  await page.route("**/conversations/first-created/messages", async route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toMatchObject({ content: question, locale });
    messagePosts += 1;
    await messageGate;
    completed = true;
    await route.fulfill({ contentType: "text/event-stream", body:
      'event: run.started\ndata: {"runId":"first-run","messageId":"first-assistant","creditBalance":98}\n\n' +
      `event: message.delta\ndata: ${JSON.stringify({ messageId: "first-assistant", delta: answer })}\n\n` +
      'event: message.completed\ndata: {"messageId":"first-assistant","model":"default","inputTokens":8,"outputTokens":24,"creditsUsed":2,"creditBalance":98}\n\n' });
  });
  const main = page.getByRole("main");
  try {
    await page.goto(`/${locale}/chat`);
    await expect(chatComposer(page)).toBeEnabled();
    const originalComposer = await chatComposer(page).elementHandle();
    await chatComposer(page).fill(question);
    await main.getByRole("button", { name: locale === "zh" ? "发送" : "Send", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/chat/first-created$`));
    await expect.poll(() => backend.reads.filter(read => read.method === "PATCH" && read.path === "/api/agent/conversations/first-created").length).toBe(1);
    // A real shell update must preserve the pending first-send transaction.
    await page.getByTestId("workspace-search-trigger").click();
    const finder = page.getByRole("dialog", { name: locale === "zh" ? "搜索工作区页面" : "Search workspace pages", exact: true });
    await expect(finder).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(finder).toBeHidden();
    await expect(main.getByRole("button", { name: locale === "zh" ? "停止生成" : "Stop generation", exact: true })).toBeVisible();
    expect(await chatComposer(page).evaluate((element, original) => element === original, originalComposer)).toBe(true);
    await expect(chatComposer(page)).toHaveValue(question);
    expect(backend.reads.filter(read => read.method === "GET" && read.path === "/api/agent/conversations")).toHaveLength(1);
    releasePermission();
    await expect.poll(() => messagePosts).toBe(1);
    await expect(main.getByRole("button", { name: locale === "zh" ? "停止生成" : "Stop generation", exact: true })).toBeVisible();
    releaseMessage();
    await expect(main.getByText("The complete owned answer remains visible.", { exact: true })).toBeVisible();
    await expect(chatComposer(page)).toBeEnabled();
    await expect(chatComposer(page)).toHaveValue("");
    await expect(main.getByRole("button", { name: locale === "zh" ? "发送" : "Send", exact: true })).toBeVisible();
    const historyName = locale === "zh" ? "历史对话" : "Conversation history";
    const phoneHistory = page.viewportSize()!.width < 1280;
    if (phoneHistory) await main.getByTestId("chat-history-trigger").click();
    const history = main.getByRole(phoneHistory ? "dialog" : "complementary", { name: historyName, exact: true });
    await expect(history.getByRole("button", { name: /^First owned conversation/ })).toBeVisible();
    if (phoneHistory) await page.keyboard.press("Escape");
    await page.reload();
    await expect(main.getByRole("heading", { name: "First response after URL assignment", exact: true, level: 2 })).toBeVisible();
    await expect(main.getByText("The complete owned answer remains visible.", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: /First-send source/ })).toHaveAttribute("href", source.url);
    await expect(chatComposer(page)).toBeEnabled();
    await expect(page).toHaveURL(new RegExp(`/${locale}/chat/first-created$`));
    expect(messagePosts).toBe(1);
    expect(backend.reads.filter(read => read.method === "POST" && read.path === "/api/agent/conversations")).toHaveLength(1);
    expect(backend.reads.filter(read => read.method === "PATCH" && read.path === "/api/agent/conversations/first-created")).toHaveLength(1);
    expect(backend.reads.filter(read => read.path.endsWith("/cancel"))).toHaveLength(0);
    await noOverflow(page); expect(errors).toEqual([]);
  } finally { releasePermission(); releaseMessage(); }
});

test("late news filters cannot replace current evidence and topics open editable drafts", async ({ page, backend, errors }) => {
  let release: (() => void) | undefined;
  backend.handlers.set("GET /api/news", async read => {
    if (read.query.get("symbol") === "BTC") { await new Promise<void>(resolve => { release = resolve; }); return { body: news("Old BTC headline") }; }
    return { body: news(read.query.get("symbol") === "ETH" ? "Current ETH headline" : "Initial market news") };
  });
  try {
    await page.goto("/en/news");
    await expect(page.getByRole("heading", { name: "Initial market news", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "BTC", exact: true }).click();
    await expect.poll(() => !!release).toBe(true);
    await page.getByRole("button", { name: "ETH", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Current ETH headline", exact: true })).toBeVisible();
    const staleResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get("symbol") === "BTC");
    release?.();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("heading", { name: "Old BTC headline", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Ask Agent", exact: true }).first().click();
    await expect(chatComposer(page)).toBeEnabled();
    await expect(chatComposer(page)).toHaveValue("Current ETH headline");
    expect(backend.reads.filter(read => read.method === "POST" && read.path.endsWith("/messages"))).toHaveLength(0);
    await noOverflow(page); expect(errors).toEqual([]);
  } finally { release?.(); }
});

test("stopping a stream is immediate and its late cancellation cannot clear a newer run", async ({ page, backend, errors }) => {
  let releaseCancel: (() => void) | undefined;
  backend.handlers.set("POST /api/agent/runs/run-stop-1/cancel", async () => { await new Promise<void>(resolve => { releaseCancel = resolve; }); return { body: { id: "run-stop-1", status: "canceled" } }; });
  backend.handlers.set("POST /api/agent/runs/run-stop-2/cancel", () => ({ body: { id: "run-stop-2", status: "canceled" } }));
  // Model only the transport: a real browser ReadableStream and AbortSignal.
  // All application run state, parsing, buttons and cancellation HTTP are real.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    let count = 0;
    window.fetch = (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.pathname.endsWith("/conversations/c1/messages") && init?.method === "POST") {
        const index = ++count;
        const encoder = new TextEncoder();
        return Promise.resolve(new Response(new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode(`event: run.started\ndata: ${JSON.stringify({ runId: `run-stop-${index}`, messageId: `assistant-stop-${index}` })}\n\n`));
          controller.enqueue(encoder.encode(`event: message.delta\ndata: ${JSON.stringify({ messageId: `assistant-stop-${index}`, delta: index === 1 ? "First stream is active" : "Second stream stays active" })}\n\n`));
          init.signal?.addEventListener("abort", () => controller.error(new DOMException("Stopped", "AbortError")), { once: true });
        } }), { headers: { "Content-Type": "text/event-stream" } }));
      }
      return original(input, init);
    };
  });
  try {
    await page.goto("/en/chat");
    const composer = chatComposer(page);
    await expect(composer).toBeEnabled(); await composer.fill("First question"); await composer.press("Enter");
    await expect(page.getByText("First stream is active", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stop generation", exact: true }).click();
    await expect.poll(() => !!releaseCancel).toBe(true);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    await composer.fill("Second question"); await composer.press("Enter");
    await expect(page.getByText("Second stream stays active", { exact: true })).toBeVisible();
    const oldCancellation = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/run-stop-1/cancel"));
    releaseCancel?.();
    await (await oldCancellation).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("button", { name: "Stop generation", exact: true })).toBeVisible();
    await expect(page.getByText("Second stream stays active", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stop generation", exact: true }).click();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { releaseCancel?.(); }
});

test("a history refresh failure cannot overwrite the run's authoritative refund", async ({ page, backend, errors }) => {
  let reads = 0;
  backend.handlers.set("GET /api/agent/conversations/c1", () => ++reads === 1 ? { body: { conversation, messages: [] } } : { status: 503, body: { detail: "Refresh unavailable" } });
  await page.route("**/conversations/c1/messages", route => route.fulfill({
    contentType: "text/event-stream",
    body: 'event: run.started\ndata: {"runId":"failed-run","messageId":"failed-answer"}\n\nevent: run.failed\ndata: {"messageId":"failed-answer","code":"PROVIDER_ERROR","message":"Provider unavailable","creditBalance":100}\n\n',
  }));
  await page.goto("/en/chat");
  const composer = chatComposer(page);
  await expect(composer).toBeEnabled(); await composer.fill("A failed provider request"); await composer.press("Enter");
  await expect(page.getByTestId("chat-error-billing")).toHaveAttribute("data-billing", "refunded");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  expect(reads).toBe(2); expect(errors).toEqual([]);
});

test("Chinese research, memory and report controls remain labeled and usable", async ({ page, errors }) => {
  await page.goto("/zh/research");
  await page.getByRole("button", { name: "新建研究任务", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "研究问题", exact: true })).toBeFocused();
  await page.getByRole("textbox", { name: "研究问题", exact: true }).fill("核验BTC资金费率与市场风险");
  await expect(page.getByRole("button", { name: "市场数据", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "开始研究", exact: true })).toBeEnabled();
  await page.goto("/zh/memory");
  await expect(page.getByRole("switch", { name: "短期记忆", exact: true })).toBeEnabled();
  await expect(page.getByText("暂无待批准的提议。", { exact: true })).toBeVisible();
  await page.goto("/zh/reports?report=report-eth");
  await expect(page.locator("#report-detail").getByRole("heading", { name: "ETH portfolio review" })).toBeVisible();
  if ((page.viewportSize()?.width || 0) < 1024) {
    await page.getByRole("button", { name: "返回归档", exact: true }).click();
    await expect(page.getByLabel("搜索报告标题或资产")).toBeFocused();
  }
  await page.getByLabel("搜索报告标题或资产").fill("BTC");
  await expect(page.getByRole("button", { name: /BTC evidence brief/ })).toBeVisible();
  await noOverflow(page); expect(errors).toEqual([]);
});

test("Stop cancels pending permission setup before any chargeable message starts", async ({ page, backend, errors }) => {
  await page.addInitScript(() => {
    const events: { signal: boolean; aborted: boolean; settled?: string }[] = [];
    Object.defineProperty(window, "__permissionProbe", { value: events });
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).endsWith("/api/agent/conversations/c1") && init?.method === "PATCH") {
        const event = { signal: !!init.signal, aborted: !!init.signal?.aborted, settled: "pending" };
        events.push(event);
        init.signal?.addEventListener("abort", () => { event.aborted = true; }, { once: true });
        return original(input, init).then(response => { event.settled = `HTTP${response.status}`; return response; }, reason => { event.settled = reason.name; throw reason; });
      }
      return original(input, init);
    };
  });
  let release: (() => void) | undefined;
  backend.handlers.set("PATCH /api/agent/conversations/c1", async () => { await new Promise<void>(resolve => { release = resolve; }); return { body: { conversation } }; });
  try {
    await page.goto("/en/chat");
    const composer = chatComposer(page);
    await expect(composer).toBeEnabled(); await composer.fill("Keep this canceled draft"); await composer.press("Enter");
    await expect.poll(() => !!release).toBe(true);
    await page.getByRole("button", { name: "Stop generation", exact: true }).click();
    // The HTTP permission response is still held. Abort must free the composer.
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    await expect(composer).toHaveValue("Keep this canceled draft");
    await expect(composer).toBeFocused();
    const signalEvents = await page.evaluate(() => Reflect.get(window, "__permissionProbe"));
    expect(signalEvents).toEqual([{ signal: true, aborted: true, settled: "AbortError" }]);
    expect(backend.reads.filter(read => read.method === "PATCH" && read.path === "/api/agent/conversations/c1")).toHaveLength(1);
    expect(backend.reads.filter(read => read.method === "POST" && read.path.endsWith("/messages"))).toHaveLength(0);
    release?.();
    await page.waitForTimeout(100);
    expect(backend.reads.filter(read => read.method === "POST" && read.path.endsWith("/messages"))).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally { release?.(); }
});


test("research detail preserves its first confirmed snapshot when the next read fails", async ({ page, backend, errors }) => {
  let reads = 0;
  backend.handlers.set("GET /api/research/runs/run-btc", () => ++reads === 1 ? { body: { run } } : { status: 503, body: { detail: "Refresh unavailable" } });
  await page.goto("/en/research/run-btc");
  await expect(page.getByRole("heading", { name: "BTC funding evidence", exact: true })).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Showing the last confirmed content" })).toBeVisible();
  const artifact = page.getByRole("heading", { name: "Research artifact", exact: true }).locator("..");
  await expect(artifact.getByText(run.summary, { exact: true })).toBeVisible();
  expect(reads).toBe(2);
  await noOverflow(page); expect(errors).toEqual([]);
});


test("shared shell controls respond before a delayed memory module arrives", async ({ page, backend, errors }, info) => {
  let releaseFeature!: () => void;
  const featureGate = new Promise<void>(resolve => { releaseFeature = resolve; });
  let featureReleased = false;
  const memoryReads = () => backend.reads.filter(read => /^\/(?:api\/)?memory(?:\/|$)/.test(read.path));
  let heldRequests = 0;
  let featureStatus: number | undefined;
  let featureUrl = "";
  let layoutStatus: number | undefined;
  let layoutFinished = false;
  let layoutError: string | undefined;
  const onResponse = (response: import("@playwright/test").Response) => {
    const path = decodeURIComponent(new URL(response.url()).pathname);
    if (!/^\/_next\/static\/chunks\/app\/\[locale\]\/layout-[^/]+\.js$/.test(path)) return;
    layoutStatus = response.status();
    void response.finished().then(error => {
      if (error) layoutError = error.message;
      else layoutFinished = true;
    }, error => { layoutError = String(error); });
  };
  page.on("response", onResponse);
  await page.route(url => /^\/_next\/static\/chunks\/app\/\[locale\]\/memory\/page-[^/]+\.js$/.test(decodeURIComponent(url.pathname)), async route => {
    const response = await route.fetch();
    featureStatus = response.status();
    featureUrl = route.request().url();
    heldRequests += 1;
    await featureGate;
    // Preserve the original status, headers and bytes; only delivery is held.
    await route.fulfill({ response });
  });
  const mobile = (page.viewportSize()?.width || 0) < 1024;
  try {
    const response = await page.goto("/zh/memory", { waitUntil: "commit" });
    expect(response?.status()).toBe(200);
    const staticMain = await page.evaluate(html => {
      const document = new DOMParser().parseFromString(html, "text/html");
      const heading = document.querySelector("main#main-content h1");
      return {
        count: document.querySelectorAll("main").length,
        heading: heading?.textContent?.trim(),
        headingHidden: Boolean(heading?.closest("[hidden]")),
      };
    }, await response!.text());
    expect(staticMain).toEqual({ count: 1, heading: "Agent 记忆", headingHidden: false });
    await expect.poll(() => heldRequests).toBe(1);
    await expect.poll(() => layoutFinished).toBe(true);
    expect(featureStatus).toBe(200);
    expect(layoutStatus).toBe(200);
    expect(layoutError).toBeUndefined();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main#main-content")).toBeVisible();
    expect(memoryReads()).toHaveLength(0);
    expect(featureReleased).toBe(false);
    if (mobile) {
      await page.getByTestId("nav-menu-button").click();
      const navigation = page.getByRole("dialog", { name: "主导航", exact: true });
      await expect(navigation).toBeVisible();
      await navigation.getByRole("button", { name: "关闭导航", exact: true }).click();
      await expect(navigation).not.toBeVisible();
    } else {
      const appearance = page.getByRole("banner").getByRole("button", { name: "切换为经典外观", exact: true });
      await expect(appearance).toBeVisible();
      await appearance.click();
      await expect(page.locator("html")).toHaveAttribute("data-visual-style", "classic");
    }
    expect(featureReleased, "shared controls must finish before the feature response is released").toBe(false);
    expect(memoryReads()).toHaveLength(0);
    await expect(page.locator("main")).toHaveCount(1);
    await info.attach("shell-before-memory-module", { body: JSON.stringify({ staticMain, featureUrl, featureStatus, heldRequests, layoutStatus, layoutFinished, memoryReadsBeforeRelease: memoryReads().length, action: mobile ? "navigation opened and closed" : "appearance changed to classic", featureReleased, errors: [...errors] }), contentType: "application/json" });
  } finally {
    featureReleased = true;
    releaseFeature();
    page.off("response", onResponse);
  }
  await expect(page.getByRole("switch", { name: "短期记忆", exact: true })).toBeEnabled();
  await expect(page.getByText("暂无待批准的提议。", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page).toHaveURL(/\/zh\/memory$/);
  await noOverflow(page);
  expect(errors).toEqual([]);
});
