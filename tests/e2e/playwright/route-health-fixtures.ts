import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readdirSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { test as base } from "@playwright/test";

export const OWNED_CONVERSATION_ID = "route-owned-conversation";
export const OWNED_RESEARCH_ID = "route-owned-research";
export const OWNED_STRATEGY_ID = "route-owned-strategy";
export const SESSION = "offline-route-health-reader";
export const HIDDEN_PREFIXES = ["/signals", "/playbooks", "/strategies", "/trading", "/nautilus", "/data-sources", "/integrations", "/daily-push", "/billing/mock-checkout"];
export const mode = process.env.PG_ROUTE_MODE || "launch";
if (mode !== "launch" && mode !== "full") throw new Error("PG_ROUTE_MODE must be launch or full");

export type AppRoute = { path: string; source: string; localized: boolean; alias: boolean };
export function discoverAppRoutes(appRoot = resolve(process.cwd(), "app")): AppRoute[] {
  const pages: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === "page.tsx") pages.push(file);
    }
  };
  walk(appRoot);
  return pages.map((source) => {
    const segments = relative(appRoot, source).split(sep).slice(0, -1).filter((part) => !/^\(.+\)$/.test(part));
    const path = "/" + segments.join("/");
    const localized = segments[0] === "[locale]";
    // The baseline only has two non-alias public page files outside locale.
    return { path, source: relative(resolve(appRoot, "../../.."), source), localized, alias: !localized && !["/privacy", "/terms"].includes(path) };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

export const routes = discoverAppRoutes();
export const canonical = routes.filter((entry) => entry.localized);
export const aliases = routes.filter((entry) => entry.alias);
export function localPattern(route: AppRoute): string { return route.path.replace(/^\/\[locale\]/, "") || "/"; }
export function isHidden(route: AppRoute): boolean {
  const path = localPattern(route);
  return HIDDEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}
export function routeUrl(route: AppRoute, locale: "en" | "zh"): string {
  return route.path.replace("[locale]", locale)
    .replace("[conversationId]", OWNED_CONVERSATION_ID)
    .replace("[runId]", OWNED_RESEARCH_ID)
    .replace("[strategyId]", OWNED_STRATEGY_ID);
}

type BackendRead = { method: string; path: string; status: number; session: boolean; transport: "browser" | "server" };
type AuditBackend = { origin: string; authority: string; requests: BackendRead[] };

const created = "2026-11-08T00:00:00Z";
const user = { id: "route-owned-reader", email: "route-reader@example.invalid", name: "OFFLINE Route Reader", role: "admin", plan: "Free", credit_balance: 0 };
const conversation = { id: OWNED_CONVERSATION_ID, title: "OFFLINE route health conversation", status: "active", created_at: created, updated_at: created, permission_mode: "read-only" };
const research = { id: OWNED_RESEARCH_ID, name: "OFFLINE degraded research", status: "degraded", is_degraded: true, created_at: created, updated_at: created, evidence_count: 0, citation_count: 0, data_sources: [], credits_used: 0, summary: "Synthetic route fixture: evidence is unavailable.", disclaimer: "Offline fixture, not investment research." };
const quota = { plan: "Free", used: 0, limit: 0, remaining: 0, concurrent_limit: 0, running: 0, credit_balance: 0 };

function endpoint(path: string) {
  let result = path.replace(/^\/__dev-api(?=\/|$)/, "");
  while (result.startsWith("/api/")) result = result.slice(4);
  return result;
}

export const test = base.extend<{}, { auditBackend: AuditBackend }>({
  auditBackend: [async ({}, use) => {
    const requests: BackendRead[] = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const path = endpoint(url.pathname);
      const method = request.method || "GET";
      const session = (request.headers.cookie || "").split(/;\s*/).includes(`pg_session=${SESSION}`);
      let status = 501;
      let body: unknown = { detail: { code: "CAPABILITY_NOT_IMPLEMENTED", message: "Optional API intentionally unavailable in offline route audit." } };
      if (method !== "GET") { status = 405; body = { detail: "Route audit is read-only; writes are forbidden." }; }
      else if (!session) { status = 401; body = { detail: "An explicit offline session is required." }; }
      else if (path === "/me") { status = 200; body = { user }; }
      else if (path === "/frontend/plugins") { status = 200; body = { plugins: [], capabilities: { plan: "Free", allowed_data_sources: [], allowed_skills: [], max_attachments: 0 } }; }
      else if (path === "/agent/capabilities") { status = 200; body = { capabilities: { plan: "Free", allowed_data_sources: [], agent_daily_runs: 0, agent_concurrent_runs: 0, queue_priority: 0, credit_balance: 0 }, models: [], skills: [], quota }; }
      else if (path === "/agent/quota") { status = 200; body = quota; }
      else if (path === "/agent/conversations") { status = 200; body = { conversations: [conversation] }; }
      else if (path === `/agent/conversations/${OWNED_CONVERSATION_ID}`) {
        status = 200;
        body = { conversation, messages: [{ id: "route-owned-message", conversation_id: OWNED_CONVERSATION_ID, role: "user", content: "Synthetic read-only history for route health.", status: "completed", input_tokens: 0, output_tokens: 0, credits_used: 0, created_at: created, sources: [] }] };
      } else if (path.startsWith("/agent/conversations/")) { status = 404; body = { detail: "Conversation not found in this synthetic owner's scope." }; }
      else if (path === "/research/runs") { status = 200; body = { runs: [research], total: 1, limit: 20, offset: 0 }; }
      else if (path === `/research/runs/${OWNED_RESEARCH_ID}`) { status = 200; body = { run: research }; }
      else if (path === `/research/runs/${OWNED_RESEARCH_ID}/evidence`) { status = 200; body = { evidence: [], total: 0 }; }
      else if (path === `/research/runs/${OWNED_RESEARCH_ID}/artifacts`) { status = 200; body = { artifacts: [] }; }
      else if (path.startsWith("/research/runs/")) { status = 404; body = { detail: "Research run not found in this synthetic owner's scope." }; }
      requests.push({ method, path, status, session, transport: request.headers["x-route-audit-transport"] === "browser" ? "browser" : "server" });
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
    const authority = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    try { await use({ origin: `http://${authority}`, authority, requests }); }
    finally {
      server.closeAllConnections();
      await new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()));
    }
  }, { scope: "worker" }],
});
