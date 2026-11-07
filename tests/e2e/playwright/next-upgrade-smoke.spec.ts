import { expect } from "@playwright/test";
import { test } from "./next-upgrade-fixtures";

test("@http standalone health and image optimization work", async ({ request }) => {
  const health = await request.get("/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ status: "ok", service: "puregamma-web" });
  const logo = await request.get("/_next/image?url=%2Flogo.png&w=64&q=75");
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toMatch(/^image\//);
  const svg = await request.get("/_next/image?url=%2Fcoins%2FETH.svg&w=64&q=75");
  expect(svg.status()).toBe(400);
});

test("@http locale redirects keep the cookie preference and query string", async ({ request }) => {
  const response = await request.get("/dashboard?tab=risk", {
    headers: { Cookie: "pg_locale=zh" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location).pathname).toBe("/zh/dashboard");
  expect(new URL(response.headers().location).search).toBe("?tab=risk");
});

test("@http unauthenticated protected routes still require a session", async ({ request }) => {
  const response = await request.get("/en/dashboard?tab=risk", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const location = new URL(response.headers().location);
  expect(location.pathname).toBe("/en/login");
  expect(location.searchParams.get("returnTo")).toBe("/en/dashboard?tab=risk");
});

test("@http authenticated SSR forwards cookies and keeps concurrent visitors separate", async ({ request, offlineBackend }) => {
  // APIRequestContext runs no JavaScript, so these reads must happen in the
  // standalone Next server. Its same-origin API resolves through the forwarded
  // host, as it does behind a reverse proxy, to this worker's loopback fixture.
  await Promise.all(["smoke-ssr-a", "smoke-ssr-b"].map(async (session, index, sessions) => {
    const response = await request.get("/zh/options?currency=ETH", {
      headers: { Cookie: `pg_session=${session}; pg_locale=zh`, "x-forwarded-host": offlineBackend.authority, "x-forwarded-proto": "http" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`ETH-OFFLINE-${session}`);
    expect(html).not.toContain(`ETH-OFFLINE-${sessions[1 - index]}`);
    const reads = offlineBackend.requests.filter((entry) => entry.cookie.includes(`pg_session=${session}`));
    expect(reads).toEqual([
      { method: "GET", path: "/api/options/long-gamma?currency=ETH", cookie: `pg_session=${session}; pg_locale=zh`, status: 200 },
      { method: "GET", path: "/api/options/earnings-gamma?language=zh", cookie: `pg_session=${session}; pg_locale=zh`, status: 200 },
    ]);
  }));
});

test("authenticated query links keep SSR data and hydrated currency in sync", async ({ page, context, baseURL, offlineBackend }) => {
  const errors: string[] = [];
  const requestStart = offlineBackend.requests.length;
  page.on("pageerror", (error) => errors.push(error.message));
  await context.addCookies([{ name: "pg_session", value: "smoke-browser", url: baseURL! }]);
  await page.setExtraHTTPHeaders({ "x-forwarded-host": offlineBackend.authority, "x-forwarded-proto": "http" });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) return route.abort();
    if (url.pathname.startsWith("/api/")) {
      return route.fulfill({ response: await route.fetch({ url: `${offlineBackend.origin}${url.pathname}${url.search}` }) });
    }
    return route.continue();
  });
  await page.routeWebSocket("**/*", (socket) => socket.close());
  const surfaceResponse = (currency: string) => page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/options/surface" && url.searchParams.get("currency") === currency && response.status() === 200;
  });

  const ethHydrated = surfaceResponse("ETH");
  const response = await page.goto("/zh/options?currency=ETH");
  expect(response?.status()).toBe(200);
  expect(await response!.text()).toContain("ETH-OFFLINE-smoke-browser");
  await ethHydrated;
  await expect(page.getByRole("cell", { name: "ETH-OFFLINE-smoke-browser", exact: true })).toBeVisible();

  const btcHydrated = surfaceResponse("BTC");
  await page.getByRole("link", { name: "BTC", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/options\?currency=BTC$/);
  await btcHydrated;
  await expect(page.getByRole("cell", { name: "BTC-OFFLINE-smoke-browser", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "ETH-OFFLINE-smoke-browser", exact: true })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/zh\/options\?currency=ETH$/);
  await expect(page.getByRole("cell", { name: "ETH-OFFLINE-smoke-browser", exact: true })).toBeVisible();
  expect(offlineBackend.requests.slice(requestStart).filter((entry) => entry.status !== 200)).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("browser migration checks", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // This suite is isolated from production APIs, exchange feeds, and providers.
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) return route.abort();
      if (url.pathname.startsWith("/api/")) {
        return route.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"Authentication required"}' });
      }
      return route.continue();
    });
    await page.routeWebSocket("**/*", (socket) => socket.close());
  });

  test("public localized pages hydrate and stay public after 401 responses", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const locale of ["en", "zh"]) {
      const identityProbe = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/me" && response.status() === 401);
      await page.goto(`/${locale}`);
      // This client-side effect proves hydration reached the identity probe.
      await identityProbe;
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh" ? "zh-CN" : "en");
      await page.waitForTimeout(500);
      expect(new URL(page.url()).pathname).toBe(`/${locale}`);
    }
    expect(errors).toEqual([]);
  });

  test("client onboarding keeps locale through navigation and Back", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/en/onboarding/assets");
    await expect(page.getByRole("heading", { name: "Choose assets to track" })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/onboarding\/style$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/onboarding\/assets$/);
    await expect(page.getByRole("heading", { name: "Choose assets to track" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
