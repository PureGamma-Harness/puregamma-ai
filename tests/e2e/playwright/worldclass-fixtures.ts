import { createServer, type IncomingMessage } from "node:http";
import { writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { expect, test as base } from "@playwright/test";

type Reply = { status?: number; body: unknown };
type Read = { method: string; path: string; query: URLSearchParams; body: string };
type Handler = (read: Read) => Reply | Promise<Reply>;
type Backend = { origin: string; authority: string; reads: Read[]; handlers: Map<string, Handler>; quoteRequests: string[] };
const now = new Date(Date.now() - 60_000).toISOString();
export const user = { id: "offline-user", role: "user", name: "Researcher", email: "research@example.invalid", plan: "Pro", credit_balance: 100 };
export const run = { id: "run-btc", name: "BTC funding evidence", status: "completed", created_at: now, updated_at: now, data_sources: ["market", "news"], evidence_count: 1, summary: "Funding alone does not establish a price forecast." };
export const conversation = { id: "c1", title: "Primary research", status: "active", created_at: now, updated_at: now, permission_mode: "workspace-write" };
const quota = { remaining: 10, limit: 20, credit_balance: 100 };
const capabilities = { plan: "Pro", allowed_data_sources: ["market", "rss"], allowed_skills: [], max_attachments: 5 };
export const reports = [
  { id: "report-btc", title: "BTC evidence brief", report_type: "daily_market_report", content_markdown: "# BTC findings\n\nRecorded funding evidence does not establish a price forecast.\n\n## Source limitations\n\nThis is recorded offline material, not a live market assessment.", assets: ["BTC"], created_at: now, language: "en", source_intelligence_id: "evidence-1" },
  { id: "report-eth", title: "ETH portfolio review", report_type: "portfolio_report", content_markdown: "# ETH findings\n\nA separate recorded portfolio review.\n\n## Risk context\n\nThe evidence is dated and no execution is authorized.", assets: ["ETH"], created_at: now, language: "en" },
];
export const messages = [
  { id: "question-1", conversation_id: "c1", role: "user", content: "What does the recorded funding evidence establish?", status: "completed", input_tokens: 0, output_tokens: 0, created_at: now, sources: [] },
  { id: "answer-1", conversation_id: "c1", role: "assistant", content: `# Recorded funding review\n\nFunding alone does not establish a price forecast.\n\n${Array.from({ length: 12 }, (_, index) => `## Evidence note ${index + 1}\n\nThe recorded funding snapshot is a dated observation. Compare independent sources and distinguish missing data from an observed zero.`).join("\n\n")}\n\n## Limits\n\nNo live provider or trading execution was used.`, status: "completed", input_tokens: 40, output_tokens: 160, credits_used: 2, credits_refunded: false, created_at: now, sources: [{ id: "source-1", citation_index: 1, title: "Recorded funding snapshot", url: "https://example.com/funding", provider: "Offline exchange", excerpt: "Recorded funding rate: 0.01%.", fetched_at: now }] },
];

// All fixtures are owned observations. Missing provider capabilities deliberately
// return unavailable; the fixture never fabricates a successful provider call.
function defaultReply(path: string): Reply {
  if (path === "/me") return { body: { user } };
  if (path === "/api/frontend/plugins") return { body: { plugins: [], capabilities } };
  if (path === "/auth/x/config") return { body: { x_login_enabled: false } };
  if (path === "/gateway/catalog") return { body: { models: [], default_model: "default", unavailable: false } };
  if (path === "/api/agent/capabilities") return { body: { capabilities, quota, models: [{ id: "default", display_name: "Offline model", available: true }], skills: [] } };
  if (path === "/api/agent/workspace-capabilities") return { body: { max_file_bytes: 1048576, max_files: 5, file_types: ["txt", "md", "png"] } };
  if (path === "/api/agent/quota") return { body: quota };
  if (path === "/api/agent/conversations") return { body: { conversations: [conversation] } };
  if (path === "/api/agent/conversations/c1") return { body: { conversation, messages } };
  if (path === "/api/research/runs") return { body: { runs: [run], total: 1 } };
  if (path === "/api/research/runs/run-btc") return { body: { run } };
  if (path === "/api/research/runs/run-btc/evidence") return { body: { evidence: [{ id: "e1", citation_index: 1, title: "Recorded funding snapshot", provider: "Offline exchange", excerpt: "Recorded funding rate: 0.01%.", fetched_at: now, url: "https://example.com/funding", is_verified: true }] } };
  if (path === "/api/research/runs/run-btc/artifacts") return { body: { artifacts: [{ id: "a1", title: "Funding review", type: "report", markdown: "# Complete research artifact\n\nThe full research body is readable here.\n\n## Limits\n\nFunding alone does not establish a price forecast." }] } };
  if (path === "/reports") return { body: { reports, unavailable: false } };
  if (path === "/notifications/imessage/config") return { status: 503, body: { detail: "Messaging is not connected in this read-only fixture" } };
  if (path === "/market/snapshot" || path === "/billing/subscription") return { status: 501, body: { detail: "Not connected in the offline fixture" } };
  return { status: 404, body: { detail: `Not provided by the offline fixture: ${path}` } };
}

export const test = base.extend<{ backend: Backend; errors: string[] }>({
  backend: async ({}, use) => {
    const handlers = new Map<string, Handler>();
    const reads: Read[] = [];
    const server = createServer(async (request: IncomingMessage, response) => {
      const url = new URL(request.url || "/", "http://offline.invalid");
      // Match the existing research fixture: the first prefix is the configured
      // API transport; a second /api is the actual backend resource namespace.
      const path = url.pathname.replace(/^\/(?:__dev-api|api)(?=\/)/, "");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const read = { method: request.method || "GET", path, query: url.searchParams, body: Buffer.concat(chunks).toString() };
      reads.push(read);
      let result: Reply;
      try {
        // This suite has no write-authorized action, even through an override.
        if (read.method !== "GET") result = { status: 405, body: { detail: "The worldclass fixture is read-only" } };
        else result = await (handlers.get(`GET ${path}`)?.(read) || defaultReply(path));
      } catch { result = { status: 500, body: { detail: "Offline fixture failure" } }; }
      if (!response.destroyed) {
        response.writeHead(result.status || 200, { "Content-Type": "application/json", "Cache-Control": "no-store", "Connection": "close" });
        response.end(JSON.stringify(result.body));
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const authority = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    try { await use({ origin: `http://${authority}`, authority, reads, handlers, quoteRequests: [] }); }
    finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  },
  errors: [async ({ page, context, baseURL, backend }, use, info) => {
    const errors: string[] = [];
    const unexpectedOutsideRequests: string[] = [];
    const blockedMutationRequests: { method: string; path: string }[] = [];
    let blockedAnalyticsScripts = 0;
    page.on("pageerror", error => errors.push(error.message));
    await context.addCookies([{ name: "pg_session", value: "offline-worldclass", url: baseURL! }]);
    await page.setExtraHTTPHeaders({ "x-forwarded-host": backend.authority, "x-forwarded-proto": "http" });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) {
        // The existing layout includes this analytics script. Abort it before
        // any network connection; an attempted blocked script is not a leak.
        if (url.origin === "https://www.googletagmanager.com" && url.pathname === "/gtag/js" && route.request().method() === "GET" && route.request().resourceType() === "script") blockedAnalyticsScripts += 1;
        else unexpectedOutsideRequests.push(url.origin);
        return route.abort();
      }
      // Draft estimation uses POST in the existing API. Decline that read
      // locally, without forwarding it or inventing a successful quote. A
      // message/send POST remains forbidden by the read-only server guard.
      if (route.request().method() === "POST" && url.pathname.endsWith("/api/agent/quote")) {
        backend.quoteRequests.push(route.request().postData() || "");
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Quote unavailable in the read-only fixture" }) });
      }
      if (route.request().method() !== "GET") {
        blockedMutationRequests.push({ method: route.request().method(), path: url.pathname });
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ detail: "This browser fixture is read-only" }) });
      }
      if (/^\/(?:api|__dev-api)\//.test(url.pathname)) return route.fulfill({ response: await route.fetch({ url: `${backend.origin}${url.pathname}${url.search}` }) });
      return route.continue();
    });
    await page.routeWebSocket("**/*", socket => socket.close());
    try {
      await use(errors);
    } finally {
      // Drain requests before tearing down their dependent loopback listener.
      await page.unrouteAll({ behavior: "wait" });
      await page.close();
    }
    // Include requests/errors that arrived during the final handler drain.
    await writeFile(info.outputPath("read-only-network.json"), JSON.stringify({
      reads: backend.reads.map(read => ({ method: read.method, path: read.path })),
      declinedQuotes: backend.quoteRequests.length,
      blockedAnalyticsScripts,
      blockedMutationRequests,
      unexpectedOutsideRequests,
      errors,
    }, null, 2));
    expect(errors).toEqual([]);
    expect(unexpectedOutsideRequests).toEqual([]);
    expect(blockedMutationRequests).toEqual([]);
    expect(backend.reads.filter(read => read.method !== "GET")).toEqual([]);
  }, { auto: true }],
});
