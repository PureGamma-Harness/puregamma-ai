import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

// Constructed source and transport fixtures, not user research or live model output.
const createdAt = "2026-11-14T00:00:00.000Z";
const updatedAt = "2026-11-14T00:01:00.000Z";
const runId = "run-integrity";
const name = "Evidence continuity review";
type Run = Record<string, unknown> & { id: string; status: string; updated_at: string };
type Read = { method: string; path: string; ordinal: number };
type Reply = { status?: number; body: unknown; headers?: Record<string, string> };
type Handler = (read: Read) => Reply | Promise<Reply>;
type Backend = {
  origin: string;
  authority: string;
  reads: Read[];
  handlers: Map<string, Handler>;
  streams: Set<ServerResponse>;
  run: Run;
  send: (events: { event: string; data: Record<string, unknown> }[]) => void;
};

function makeRun(status: string, extra: Record<string, unknown> = {}): Run {
  return {
    id: runId, name, status, created_at: createdAt, updated_at: status === "running" || status === "preparing" ? createdAt : updatedAt,
    data_sources: ["market"], evidence_count: 1, citation_count: 1,
    verification: status === "completed" ? "verified" : null,
    is_degraded: status === "degraded",
    summary: "The recorded source states a funding rate; it does not establish a forecast.",
    disclaimer: "Conclusions are not human-verified. Reference identity is not factual verification.",
    ...extra,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const test = base.extend<{ backend: Backend; errors: string[] }>({
  backend: async ({}, use) => {
    const handlers = new Map<string, Handler>();
    const reads: Read[] = [];
    const streams = new Set<ServerResponse>();
    let backend!: Backend;
    const server = createServer(async (request: IncomingMessage, response) => {
      const url = new URL(request.url || "/", "http://fixture.invalid");
      const path = url.pathname.replace(/^\/(?:__dev-api|api)(?=\/)/, "");
      const read = { method: request.method || "GET", path, ordinal: reads.length + 1 };
      reads.push(read);
      const cors = { "Access-Control-Allow-Origin": request.headers.origin || "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*", "Cache-Control": "no-store" };
      if (request.method === "OPTIONS") { response.writeHead(204, cors); response.end(); return; }
      if (path === `/api/research/runs/${runId}/events`) {
        response.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Connection": "keep-alive" });
        response.write(": fixture-open\n\n");
        streams.add(response);
        response.on("close", () => streams.delete(response));
        return;
      }
      let reply: Reply;
      try {
        const handler = handlers.get(`${read.method} ${path}`);
        if (handler) reply = await handler(read);
        else if (path === "/me") reply = { body: { user: { id: "offline-user", name: "Researcher", email: "research@example.invalid", role: "user", plan: "Pro", credit_balance: 100 } } };
        else if (path === "/api/frontend/plugins") reply = { body: { plugins: [] } };
        else if (path === "/auth/x/config") reply = { body: { x_login_enabled: false } };
        else if (path === `/api/research/runs/${runId}`) reply = { body: { run: backend.run } };
        else if (path === `/api/research/runs/${runId}/evidence`) reply = { body: { evidence: [{ id: "source-1", citation_index: 1, title: "Constructed funding source", provider: "Offline fixture", excerpt: "Recorded funding rate: 0.01%.", fetched_at: createdAt, url: "https://example.invalid/raw-fixture-source", is_verified: true }] } };
        else if (path === `/api/research/runs/${runId}/artifacts`) reply = { body: { artifacts: [{ id: "artifact-1", title: "Recorded finding", type: "report", markdown: "## Evidence and limits\n\nThe fixture records a funding rate of 0.01% [1]. This alone does not establish a forecast." }] } };
        else reply = { status: 404, body: { detail: "Not provided by this offline fixture" } };
      } catch { reply = { status: 500, body: { detail: "Offline fixture failure" } }; }
      if (!response.destroyed) {
        response.writeHead(reply.status || 200, { ...cors, "Content-Type": "application/json", ...reply.headers });
        response.end(JSON.stringify(reply.body));
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const authority = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    backend = {
      origin: `http://${authority}`, authority, reads, handlers, streams, run: makeRun("running"),
      send(events) {
        const block = events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify({ run_id: runId, updated_at: updatedAt, ...data })}\n\n`).join("");
        for (const stream of streams) stream.write(block);
      },
    };
    try { await use(backend); }
    finally { for (const stream of streams) stream.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  },
  errors: async ({ page, context, baseURL, backend }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.addCookies([{ name: "pg_session", value: "offline-research-integrity", url: baseURL! }]);
    await page.setExtraHTTPHeaders({ "x-forwarded-host": backend.authority, "x-forwarded-proto": "http" });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) return route.abort();
      // A real browser connection preserves streaming and cancellation. route.fetch
      // buffers an SSE response and would bypass the transport under test.
      if (/^\/(?:api|__dev-api)\//.test(url.pathname)) return route.continue({ url: `${backend.origin}${url.pathname}${url.search}` });
      return route.continue();
    });
    await page.routeWebSocket("**/*", socket => socket.close());
    try { await use(errors); expect(errors).toEqual([]); }
    finally { await page.unrouteAll({ behavior: "wait" }); await page.close(); }
  },
});

function detail(page: Page) { return page.getByRole("main").getByRole("region", { name, exact: true }); }
function status(page: Page, label: string) { return detail(page).locator("header").getByText(label, { exact: true }); }
async function openActive(page: Page, backend: Backend) {
  await page.goto(`/en/research/${runId}`);
  await expect(detail(page).getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(detail(page).getByText("Live connection", { exact: true })).toBeVisible();
  expect(backend.streams.size).toBeGreaterThan(0);
}
async function capture(page: Page, backend: Backend, info: TestInfo) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("research-integrity.png"), fullPage: true });
  await info.attach("fixture-network", { body: JSON.stringify({ reads: backend.reads, run: backend.run }, null, 2), contentType: "application/json" });
}

test("degraded SSE remains partial when the detail refresh is unavailable", async ({ page, backend, errors }, info) => {
  await openActive(page, backend);
  let failedRefreshes = 0;
  backend.handlers.set(`GET /api/research/runs/${runId}`, () => { failedRefreshes++; return { status: 503, body: { detail: "Refresh unavailable" } }; });
  backend.send([
    { event: "run.state", data: { status: "degraded" } },
    { event: "run.completed", data: { status: "degraded", degraded: true, verified: false } },
  ]);
  await expect(status(page, "Degraded")).toBeVisible();
  await expect(detail(page).getByText(/This run is degraded[.:].*partial/i)).toBeVisible();
  await expect(detail(page).getByRole("alert")).toContainText("Some updates could not be loaded");
  await expect(detail(page).getByRole("button", { name: "Reload", exact: true })).toBeVisible();
  await expect(status(page, "Completed")).toHaveCount(0);
  expect(failedRefreshes).toBeGreaterThan(0);
  await capture(page, backend, info); expect(errors).toEqual([]);
});

test("a late running poll cannot overwrite a newer degraded terminal event", async ({ page, backend, errors }, info) => {
  let calls = 0;
  const oldPoll = deferred<Reply>();
  backend.handlers.set(`GET /api/research/runs/${runId}`, () => ++calls === 2 ? oldPoll.promise : { body: { run: backend.run } });
  try {
    await openActive(page, backend);
    await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
    backend.run = makeRun("degraded", { verification: "degraded" });
    backend.send([
      { event: "run.state", data: { status: "degraded" } },
      { event: "run.completed", data: { status: "degraded", degraded: true, verified: false } },
    ]);
    await expect(status(page, "Degraded")).toBeVisible();
    await detail(page).locator("header").evaluate(header => {
      const states: string[] = [];
      (window as unknown as { integrityObservedStates: string[] }).integrityObservedStates = states;
      new MutationObserver(() => states.push(header.textContent || "")).observe(header, { subtree: true, childList: true, characterData: true });
    });
    const lateResponse = page.waitForResponse(response => response.headers()["x-fixture-step"] === "late-running-poll");
    oldPoll.resolve({ body: { run: makeRun("running") }, headers: { "x-fixture-step": "late-running-poll" } });
    await (await lateResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const observed = await page.evaluate(() => (window as unknown as { integrityObservedStates: string[] }).integrityObservedStates);
    expect(observed.filter(text => /\bRunning\b/.test(text))).toEqual([]);
    // Inspect after the known response and paint, without waiting for a later
    // poll to hide a transient regression back to Running.
    expect(await status(page, "Degraded").isVisible()).toBe(true);
    expect(await status(page, "Running").count()).toBe(0);
    await info.attach("late-poll-state-observations", { body: JSON.stringify(observed), contentType: "application/json" });
    await capture(page, backend, info); expect(errors).toEqual([]);
  } finally { oldPoll.resolve({ status: 503, body: { detail: "Disposed" } }); }
});

test("an evidence-preparation failure does not invent collection or validation success", async ({ page, backend, errors }, info) => {
  backend.run = makeRun("failed", { evidence_count: 0, citation_count: 0, summary: null, error_message: "Research evidence is unavailable. Please retry later." });
  backend.handlers.set(`GET /api/research/runs/${runId}/evidence`, () => ({ body: { evidence: [] } }));
  backend.handlers.set(`GET /api/research/runs/${runId}/artifacts`, () => ({ body: { artifacts: [] } }));
  await page.goto(`/en/research/${runId}`);
  await expect(status(page, "Failed")).toBeVisible();
  await detail(page).getByText("View research process", { exact: true }).click();
  const timeline = detail(page).getByRole("list", { name: "Research timeline", exact: true });
  for (const stage of ["Data Sources", "Evidence Collection", "Validation"]) await expect(timeline.getByRole("listitem").filter({ hasText: stage })).toContainText("Not confirmed");
  await expect(detail(page).getByText("This run has not produced evidence yet.", { exact: true })).toBeVisible();
  await capture(page, backend, info); expect(errors).toEqual([]);
});

test("a preparing timeout remains distinct when its detail refresh fails", async ({ page, backend, errors }, info) => {
  backend.run = makeRun("preparing", { evidence_count: 0, citation_count: 0, summary: null });
  backend.handlers.set(`GET /api/research/runs/${runId}/evidence`, () => ({ body: { evidence: [] } }));
  backend.handlers.set(`GET /api/research/runs/${runId}/artifacts`, () => ({ body: { artifacts: [] } }));
  await openActive(page, backend);
  backend.handlers.set(`GET /api/research/runs/${runId}`, () => ({ status: 503, body: { detail: "Refresh unavailable" } }));
  backend.send([{ event: "run.failed", data: { status: "timed_out", message: "Research deadline exceeded." } }]);
  await expect(status(page, "Timed out")).toBeVisible();
  await expect(status(page, "Failed")).toHaveCount(0);
  await detail(page).getByText("View research process", { exact: true }).click();
  const timeline = detail(page).getByRole("list", { name: "Research timeline", exact: true });
  for (const stage of ["Evidence Collection", "Validation"]) await expect(timeline.getByRole("listitem").filter({ hasText: stage })).toContainText("Not confirmed");
  await capture(page, backend, info); expect(errors).toEqual([]);
});

test("completed reference checks are not presented as factual verification", async ({ page, backend, errors }, info) => {
  backend.run = makeRun("completed");
  await page.goto(`/en/research/${runId}`);
  await expect(status(page, "Completed")).toBeVisible();
  await expect(detail(page).getByText("Reference checks match citation identifiers to recorded sources; they do not establish that a claim is true.", { exact: true })).toBeVisible();
  await expect(detail(page).getByText("Recorded source · not fact-checked", { exact: true })).toBeVisible();
  await expect(detail(page).getByText("Verified snapshot", { exact: true })).toHaveCount(0);
  await expect(detail(page).getByRole("link", { name: "Constructed funding source", exact: true })).toHaveAttribute("href", "https://example.invalid/raw-fixture-source");
  await expect(detail(page).getByRole("paragraph").filter({ hasText: /Conclusions are not human-verified/ })).toBeVisible();
  await capture(page, backend, info); expect(errors).toEqual([]);
});

test("a closed stream falls back to polling and recovers the authoritative terminal state", async ({ page, backend, errors }, info) => {
  await openActive(page, backend);
  backend.run = makeRun("degraded", { verification: "degraded" });
  for (const stream of backend.streams) stream.end();
  await expect(detail(page).getByText("Reconnecting · polling updates", { exact: true })).toBeVisible();
  await expect(status(page, "Failed")).toHaveCount(0);
  await expect(status(page, "Degraded")).toBeVisible({ timeout: 15_000 });
  await expect(detail(page).getByText(/This run is degraded[.:].*partial/i)).toBeVisible();
  await capture(page, backend, info); expect(errors).toEqual([]);
});
