import { expect, type Page } from "@playwright/test";
import { test, routes, canonical, aliases, isHidden, localPattern, mode, routeUrl, SESSION } from "./route-health-fixtures";

const failures = new WeakMap<Page, { errors: string[]; blocked: string[] }>();
const genericFailure = /This page could not be loaded|暂时无法加载此页面|Application error: a client-side exception/;

test.beforeEach(async ({ page, context, baseURL, auditBackend }) => {
  const state = { errors: [] as string[], blocked: [] as string[] };
  failures.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await context.addCookies([{ name: "pg_session", value: SESSION, url: baseURL! }]);
  await page.setExtraHTTPHeaders({ "x-forwarded-host": auditBackend.authority, "x-forwarded-proto": "http" });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) { state.blocked.push(url.origin); return route.abort(); }
    if (/^\/(api|__dev-api)(\/|$)/.test(url.pathname)) {
      return route.fulfill({ response: await route.fetch({ url: `${auditBackend.origin}${url.pathname}${url.search}`, headers: { ...route.request().headers(), "x-route-audit-transport": "browser" } }) });
    }
    return route.continue();
  });
  await page.routeWebSocket("**/*", (socket) => socket.close());
});

test("@http route discovery accounts for every baseline page and redirect", async () => {
  expect(routes).toHaveLength(90);
  expect(canonical).toHaveLength(54);
  expect(aliases.filter((entry) => entry.path !== "/")).toHaveLength(33);
  expect(routes.filter((entry) => !entry.localized && !entry.alias).map((entry) => entry.path).sort()).toEqual(["/privacy", "/terms"]);
  expect(new Set(routes.map((entry) => entry.path)).size).toBe(routes.length);
});

test("@http every legacy alias preserves preferred locale and query values", async ({ request }) => {
  for (const locale of ["en", "zh"]) {
    for (const entry of aliases) {
      const response = await request.get(`${entry.path}?route_audit=retained`, { maxRedirects: 0, headers: { Cookie: `pg_session=${SESSION}; pg_locale=${locale}` } });
      expect(response.status(), entry.path).toBe(307);
      const location = new URL(response.headers().location, response.url());
      expect(location.pathname, entry.path).toBe(`/${locale}${entry.path === "/" ? "" : entry.path}`);
      expect(location.searchParams.get("route_audit"), entry.path).toBe("retained");
    }
  }
});

test("@http server-rendered reads use only the owned loopback fixture", async ({ request, auditBackend }) => {
  const start = auditBackend.requests.length;
  const response = await request.get("/en/options?currency=ETH", { headers: { Cookie: `pg_session=${SESSION}`, "x-forwarded-host": auditBackend.authority, "x-forwarded-proto": "http" } });
  expect(response.status()).toBe(200);
  const serverReads = auditBackend.requests.slice(start);
  expect(serverReads.map((entry) => entry.path).sort()).toEqual(["/options/earnings-gamma", "/options/long-gamma"]);
  expect(serverReads.every((entry) => entry.session && entry.transport === "server" && entry.method === "GET")).toBe(true);
});

for (const entry of canonical) {
  for (const locale of ["en", "zh"] as const) {
    const route = routeUrl(entry, locale);
    if (mode === "launch" && isHidden(entry)) {
      test(`@http launch gate ${route} redirects to its localized dashboard`, async ({ request }) => {
        const response = await request.get(`${route}?route_audit=hidden`, { maxRedirects: 0, headers: { Cookie: `pg_session=${SESSION}` } });
        expect(response.status()).toBe(307);
        const location = new URL(response.headers().location, response.url());
        expect(location.pathname).toBe(`/${locale}/dashboard`);
        expect(location.search).toBe("");
      });
    } else {
      test(`route health ${route}`, async ({ page, auditBackend }, info) => {
        const start = auditBackend.requests.length;
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(response, "route must produce an HTTP response").not.toBeNull();
        expect(response!.status(), "server-rendered route must not crash").toBe(200);
        await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
        await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh" ? "zh-CN" : "en");
        // Fixed fixtures settle immediately. Waiting for idle also lets the
        // route's hydrated capability/error state replace initial skeletons.
        await page.waitForLoadState("networkidle");
        const main = page.getByRole("main");
        await expect(main).toBeVisible();
        await expect(main).not.toContainText(genericFailure);
        if (localPattern(entry) === "/docs") {
          // The embedded third-party document is deliberately blocked offline.
          // Its local recovery controls have a semantic contract; Chinese copy
          // must not be judged by the length of the equivalent English text.
          const docsUrl = locale === "zh"
            ? "https://puregamma-ai.gitbook.io/puregamma-ai/"
            : "https://puregamma-ai.gitbook.io/puregamma-ai/english/getting-started";
          await expect(main.getByRole("heading", { level: 1, name: locale === "zh" ? "帮助文档" : "Documentation", exact: true })).toBeVisible();
          const externalLink = main.getByRole("link", { name: locale === "zh" ? "新窗口打开" : "Open in new tab", exact: true });
          await expect(externalLink).toBeVisible();
          await expect(externalLink).toHaveAttribute("href", docsUrl);
          await expect(externalLink).toHaveAttribute("target", "_blank");
          expect((await externalLink.getAttribute("rel") || "").toLowerCase().split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
          const preview = main.locator("iframe");
          await expect(preview).toBeVisible();
          await expect(preview).toHaveAttribute("title", locale === "zh" ? "PureGamma AI 帮助文档" : "PureGamma AI documentation");
          await expect(preview).toHaveAttribute("src", docsUrl);
        } else {
          await expect.poll(async () => (await main.innerText()).replace(/\s/g, "").length).toBeGreaterThan(30);
        }
        await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);

        if (localPattern(entry) === `/chat/[conversationId]`) await expect(main).toContainText("Synthetic read-only history for route health.");
        if (localPattern(entry) === `/research/[runId]`) await expect(main.getByRole("heading", { name: "OFFLINE degraded research", exact: true })).toBeVisible();
        if (localPattern(entry).startsWith("/trading") || localPattern(entry) === "/nautilus" || localPattern(entry).startsWith("/strategies")) {
          await expect(main).toContainText(/LIVE|不可用|unavailable|未启用|disabled/i);
        }

        const geometry = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const documentWidth = document.documentElement.scrollWidth;
          const elements = [...document.querySelectorAll("main *")].flatMap((element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (box.width < 1 || box.height < 1 || style.visibility === "hidden" || box.left >= width || box.right <= width + 1) return [];
            return [{ tag: element.tagName, className: element.className, right: Math.round(box.right), width: Math.round(box.width), text: element.textContent?.trim().slice(0, 80) }];
          }).slice(0, 12);
          return { viewportWidth: width, documentWidth, elements };
        });
        const state = failures.get(page)!;
        const reads = auditBackend.requests.slice(start);
        await info.attach("route-health.json", { body: JSON.stringify({ route, source: entry.source, mode, viewport: page.viewportSize(), response: response!.status(), geometry, browserErrors: state.errors, blockedExternalOrigins: [...new Set(state.blocked)], apiRequests: reads }, null, 2), contentType: "application/json" });
        expect(geometry.documentWidth, `${route} page overflow: ${JSON.stringify(geometry.elements)}`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
        expect(state.errors, `${route} must not throw after hydration`).toEqual([]);
        expect(reads.filter((item) => item.method !== "GET"), "browsing must not create side effects").toEqual([]);
      });
    }
  }
}

test("owned detail fixtures do not turn missing IDs into successful content", async ({ page, auditBackend }) => {
  for (const route of ["/en/chat/route-missing", "/en/research/route-missing"]) {
    const start = auditBackend.requests.length;
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    await expect.poll(async () => (await main.innerText()).replace(/\s/g, "").length).toBeGreaterThan(30);
    await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
    const feedback = route.startsWith("/en/chat/")
      ? main.getByTestId("chat-error")
      : main.getByRole("status").filter({ hasText: "Harness Research not available yet" });
    await expect(feedback, "a missing owned ID must produce visible, explicit recovery feedback").toBeVisible();
    await expect(feedback).not.toBeEmpty();
    await expect(main).not.toContainText(genericFailure);
    await expect(main).not.toContainText("Synthetic read-only history for route health.");
    await expect(main).not.toContainText("OFFLINE degraded research");
    expect(auditBackend.requests.slice(start).some((item) => item.status === 404)).toBe(true);
  }
  expect(failures.get(page)!.errors).toEqual([]);
});

for (const path of ["/privacy", "/terms"]) {
  test(`public legal route ${path} stays readable without an authenticated session`, async ({ page, context }) => {
    await context.clearCookies();
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    expect(failures.get(page)!.errors).toEqual([]);
  });
}
