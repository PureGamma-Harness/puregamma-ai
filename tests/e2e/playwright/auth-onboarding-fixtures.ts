import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test as base } from "@playwright/test";

export const SESSION = "offline-mvp-auth";
type ServerRead = { method: string; path: string; session: boolean; status: number };

// page.route() only intercepts browser traffic. The real dashboard destination
// also reads data in the Next server, so give those reads an owned, bounded
// response instead of sending them back into a standalone app with no API.
export const test = base.extend<{ onboardingBackend: { authority: string; requests: ServerRead[] } }>({
  onboardingBackend: async ({}, use) => {
    const requests: ServerRead[] = [];
    const server = createServer((request, response) => {
      const method = request.method || "GET";
      const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const session = (request.headers.cookie || "").split(/;\s*/).includes(`pg_session=${SESSION}`);
      const status = method !== "GET" ? 405 : !session ? 401 : 501;
      requests.push({ method, path, session, status });
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ detail: "No live provider in this onboarding test" }));
    });
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
    try {
      await use({ authority: `127.0.0.1:${(server.address() as AddressInfo).port}`, requests });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()));
    }
  },
});
