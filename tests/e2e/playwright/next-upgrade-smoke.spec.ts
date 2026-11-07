import { expect, test } from "@playwright/test";

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
