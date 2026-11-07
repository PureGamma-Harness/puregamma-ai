import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test as base } from "@playwright/test";

type BackendRequest = { method: string; path: string; cookie: string; status: number };
type OfflineBackend = { origin: string; authority: string; requests: BackendRequest[] };

export const test = base.extend<{}, { offlineBackend: OfflineBackend }>({
  offlineBackend: [async ({}, use) => {
    const requests: BackendRequest[] = [];
    // No proxy or external client: this backend only serves fixed test data on
    // an ephemeral loopback port. Unknown endpoints fail rather than going live.
    const server = createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const cookie = request.headers.cookie || "";
      const session = cookie.match(/(?:^|;\s*)pg_session=(smoke-(?:ssr-a|ssr-b|browser))(?:;|$)/)?.[1];
      let status = 200;
      let body: object;
      if (!session) {
        status = 401;
        body = { detail: "Offline session required" };
      } else if (request.method !== "GET") {
        status = 405;
        body = { detail: "Read-only fixture" };
      } else if (url.pathname === "/api/options/long-gamma") {
        const currency = url.searchParams.get("currency");
        if (currency !== "BTC" && currency !== "ETH") {
          status = 400;
          body = { detail: "Unexpected currency" };
        } else {
          body = {
            provider: "offline-fixture", status: "HEALTHY", currency, instrument_count: 1, live_trading: false,
            candidates: [{
              instrument: `${currency}-OFFLINE-${session}`, research_score: 91.2, mark_iv: 50,
              greeks: { delta: 0.5, gamma: 0.01, theta: -0.2 },
              spread_pct: 0.01, open_interest: 42, days_to_expiry: 7,
            }],
          };
        }
      } else if (url.pathname === "/api/options/earnings-gamma") {
        body = { status: "HEALTHY", source: "offline-fixture", candidates: [], live_trading: false };
      } else if (url.pathname === "/api/me") {
        body = { user: { id: session, email: "smoke@example.invalid", name: "Offline Visitor", role: "user", plan: "Free", credit_balance: 0 } };
      } else if (url.pathname === "/api/api/frontend/plugins") {
        body = { plugins: [], capabilities: { plan: "Free", allowed_data_sources: [], allowed_skills: [], max_attachments: 0 } };
      } else if (url.pathname === "/api/options/surface-tickers") {
        body = { tickers: [] };
      } else if (url.pathname === "/api/options/surface") {
        body = {
          status: "HEALTHY", provider: "offline-fixture", currency: url.searchParams.get("currency"),
          surface: { x: [], y: [], z: [], rows: [], type: "mark_iv", underlying_price: 0 },
          candidates: [], insights: null, live_trading: false,
        };
      } else {
        status = 501;
        body = { detail: `Unconfigured offline endpoint: ${url.pathname}` };
      }
      requests.push({ method: request.method || "", path: `${url.pathname}${url.search}`, cookie, status });
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const authority = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await use({ origin: `http://${authority}`, authority, requests });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, { scope: "worker" }],
});
