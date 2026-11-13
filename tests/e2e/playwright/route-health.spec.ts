import { expect, type Locator, type Page } from "@playwright/test";
import { test, routes, canonical, aliases, isHidden, localPattern, mode, routeUrl, SESSION, OWNED_RESEARCH_ID } from "./route-health-fixtures";

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

test("@http owned fixture isolates completed reads across request contexts", async ({ request, context, auditBackend }) => {
  const start = auditBackend.requests.length;
  const url = `${auditBackend.origin}/api/api/research/runs?limit=5&offset=0`;
  const headers = { Cookie: `pg_session=${SESSION}` };
  const warm = await request.get(url, { headers });
  expect(warm.status()).toBe(200);
  const body = await warm.json();
  expect(body).toMatchObject({ runs: [{ id: OWNED_RESEARCH_ID, status: "degraded", is_degraded: true }], total: 1 });
  for (const [client, transport] of [[context.request, "browser"], [request, "server"]] as const) {
    const responses = await Promise.all(Array.from({ length: 6 }, () => client.get(url, {
      headers: { ...headers, "x-route-audit-transport": transport },
    })));
    for (const response of responses) {
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(body);
    }
  }
  const reads = auditBackend.requests.slice(start);
  expect(reads).toHaveLength(13);
  expect(reads.every((read) => read.path === "/research/runs" && read.method === "GET" && read.status === 200 && read.session)).toBe(true);
  expect(reads.filter((read) => read.transport === "browser")).toHaveLength(6);
  expect(reads.filter((read) => read.transport === "server")).toHaveLength(7);
  expect(new Set(reads.map((read) => read.connectionId)).size, "completed fixture responses must not leave reusable sockets shared across request contexts").toBe(reads.length);
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

async function expectPageWidth(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

async function expectInside(container: Locator, contents: Locator) {
  expect(await contents.count()).toBeGreaterThan(0);
  for (const item of await contents.all()) {
    await expect(item).toBeVisible();
    // Recharts responds to viewport changes through ResizeObserver. Re-read
    // both boxes until that layout has settled instead of racing one frame.
    await expect(async () => {
      const parent = await container.boundingBox();
      const box = await item.boundingBox();
      expect(parent).not.toBeNull();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.x).toBeGreaterThanOrEqual(parent!.x - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(parent!.x + parent!.width + 1);
    }).toPass({ timeout: 12_000 });
  }
}

for (const locale of ["en", "zh"] as const) {
  test(`responsive gateway controls and populated charts /${locale}`, async ({ page, auditBackend }, info) => {
    const start = auditBackend.requests.length;
    const usageReads: URL[] = [];
    // The baseline route audit exercises unavailable APIs. Also cover the
    // populated chart grid without contacting a provider or invoking writes.
    const totals = { requests: 2, success: 2, errors: 0, input_tokens: 10, output_tokens: 5, cache_tokens: 0, reasoning_tokens: 0, avg_latency_ms: 100, max_latency_ms: 120, cost_usd: "0.001" };
    await page.route(/\/api\/admin\/gateway\/usage(?:\?|$)/, (route) => {
      expect(route.request().method()).toBe("GET");
      usageReads.push(new URL(route.request().url()));
      return route.fulfill({ json: { start: "2026-11-01T00:00:00Z", end: "2026-11-02T00:00:00Z", granularity: "day", totals, buckets: [{ bucket: "2026-11-01T00:00:00Z", ...totals }], by_model: [], by_key: [] } });
    });
    await page.goto(`/${locale}/admin/gateway`);
    await page.waitForLoadState("networkidle");
    const main = page.getByRole("main");
    await expect(main.locator(".recharts-wrapper")).toHaveCount(4);
    const dates = main.locator('input[type="date"]');
    const apply = main.getByRole("button", { name: locale === "zh" ? "应用" : "Apply", exact: true });
    const widths = info.project.name === "mobile390" ? [320, 360, 390, 430] : [1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      await expectPageWidth(page);
      await expectInside(main, dates);
      await expectInside(main, apply);
      for (const card of await main.locator("section").all()) {
        await expectInside(main, card);
        await expectInside(card, card.getByRole("heading"));
      }
      for (const chart of await main.locator(".recharts-wrapper").all()) {
        await expectInside(chart.locator("xpath=ancestor::section"), chart);
      }
    }
    await dates.nth(0).fill("2026-11-01");
    await dates.nth(1).fill("2026-11-02");
    await apply.click();
    await expect.poll(() => usageReads.some((url) => url.searchParams.get("start")?.startsWith("2026-11-01") && url.searchParams.get("end")?.startsWith("2026-11-02"))).toBe(true);
    await expect(apply).toBeEnabled();
    await expectPageWidth(page);
    expect(auditBackend.requests.slice(start).every((read) => read.method === "GET")).toBe(true);
    expect(failures.get(page)!.errors).toEqual([]);
  });

  test(`responsive dashboard activity cards and market tables /${locale}`, async ({ page, auditBackend }) => {
    const start = auditBackend.requests.length;
    await page.goto(`/${locale}/dashboard`);
    await page.waitForLoadState("networkidle");
    const main = page.getByRole("main");
    const stream = main.locator(".chrono-decision-stream");
    const cards = stream.locator("section");
    await expect(cards).toHaveCount(3);
    await expect(stream.getByRole("link", { name: /OFFLINE route health conversation/ })).toBeVisible();
    await expect(stream.getByRole("link", { name: /OFFLINE degraded research/ })).toBeVisible();
    await expectPageWidth(page);
    for (const card of await cards.all()) {
      await expectInside(stream, card);
      await expectInside(card, card.locator("h2, a, a > span"));
    }
    // Wide market data remains reachable by scrolling its own container,
    // rather than making the document wider or hiding the far columns.
    const tables = main.locator(".workbench table");
    await expect(tables).toHaveCount(2);
    for (const table of await tables.all()) {
      const scroller = table.locator("..");
      await expectInside(main, scroller);
      expect(await scroller.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
      await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      await expectInside(scroller, table.locator("thead th:last-child"));
      await scroller.evaluate((element) => { element.scrollLeft = 0; });
    }
    for (let repeat = 0; repeat < 2; repeat++) {
      await main.getByRole("button", { name: locale === "zh" ? "收起行情列表" : "Collapse market list", exact: true }).click();
      await expect(tables).toHaveCount(1);
      await main.getByRole("button", { name: locale === "zh" ? "展开行情列表" : "Expand market list", exact: true }).click();
      await expect(tables).toHaveCount(2);
      await expectPageWidth(page);
    }
    expect(auditBackend.requests.slice(start).every((read) => read.method === "GET")).toBe(true);
    expect(failures.get(page)!.errors).toEqual([]);
  });
}
