import { expect } from "@playwright/test";
import { test } from "./next-upgrade-fixtures";

test.beforeEach(async ({ page, context, baseURL, offlineBackend }) => {
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
});

for (const locale of ["en", "zh"] as const) {
  test(`closed navigation stays out of the accessibility tree and keyboard path (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}`);
    await expect(page.getByTestId("nav-menu-button")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`mobile navigation contains focus, closes with Escape and restores its trigger (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}`);
    const trigger = page.getByTestId("nav-menu-button");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: locale === "zh" ? "主导航" : "Primary navigation", exact: true });
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByRole("button", { name: locale === "zh" ? "关闭导航" : "Close navigation" })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await trigger.evaluate((button) => button.focus());
    await expect(dialog.getByRole("button", { name: locale === "zh" ? "关闭导航" : "Close navigation" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    for (let index = 0; index < 30; index++) {
      // Native dialogs also allow the browser's own chrome to receive focus.
      // When focus is in the document, it must never reach background content.
      expect(await page.evaluate(() => !document.hasFocus() || !!document.activeElement?.closest("dialog[open]"))).toBe(true);
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
}

test("backdrop and desktop resize dismiss the drawer and restore scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  const trigger = page.getByTestId("nav-menu-button");
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.mouse.click(380, 400);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page.locator("aside nav")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("keyboard users skip repeated navigation and retain focus in both appearances", async ({ page }) => {
  await page.goto("/en");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  for (const appearance of ["classic", "glass"]) {
    await page.locator("html").evaluate((element, value) => { element.dataset.visualStyle = value; }, appearance);
    expect(await skip.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  }
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("desktop navigation announces the current page and dashboard offers real workflows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/en/dashboard");
  await expect(page.locator('aside a[href="/en/dashboard"]')).toHaveAttribute("aria-current", "page");
  const workflows = page.getByRole("navigation", { name: "Research workflows", exact: true });
  await expect(workflows.getByRole("link")).toHaveCount(3);
  for (const path of ["research", "reports", "portfolio"]) {
    await expect(workflows.locator(`a[href="/en/${path}"]`)).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/en/account");
  const primaryNav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  const account = primaryNav.getByRole("link", { name: "Account", exact: true });
  await expect(account).toHaveAttribute("aria-current", "page");
  for (const height of [720, 640]) {
    if (height === 640) await page.setViewportSize({ width: 1024, height });
    // A passive intersection assertion must pass before an interaction could
    // automatically scroll a clipped link into view for the test.
    await expect(account).toBeInViewport({ ratio: 1 });
    const navBox = await primaryNav.boundingBox();
    const accountBox = await account.boundingBox();
    expect(navBox).not.toBeNull();
    expect(accountBox).not.toBeNull();
    expect(accountBox!.y).toBeGreaterThanOrEqual(navBox!.y - 1);
    expect(accountBox!.y + accountBox!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height + 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  // Navigate through the shared finder so clicking a hidden Dashboard link
  // cannot supply the sidebar's required upward scroll on the app's behalf.
  await page.getByTestId("workspace-search-trigger").click();
  const finder = page.getByRole("dialog", { name: "Search workspace pages", exact: true });
  await finder.getByRole("combobox", { name: "Page name", exact: true }).fill("Dashboard");
  await finder.getByRole("option", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  const dashboard = primaryNav.getByRole("link", { name: "Dashboard", exact: true });
  await expect(dashboard).toHaveAttribute("aria-current", "page");
  await expect(dashboard).toBeInViewport({ ratio: 1 });
  const navBox = await primaryNav.boundingBox();
  const dashboardBox = await dashboard.boundingBox();
  expect(navBox).not.toBeNull();
  expect(dashboardBox).not.toBeNull();
  expect(dashboardBox!.y).toBeGreaterThanOrEqual(navBox!.y - 1);
  expect(dashboardBox!.y + dashboardBox!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height + 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("appearance controls share current state, including when browser storage is blocked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/en");
  const glassButtons = page.getByRole("button", { name: "Switch to classic appearance", exact: true });
  await expect(glassButtons).toHaveCount(1);
  await glassButtons.click();
  await expect(page.locator("html")).toHaveAttribute("data-visual-style", "classic");
  const classicButtons = page.getByRole("button", { name: "Switch to glass appearance", exact: true });
  await expect(classicButtons).toHaveCount(1);
  await expect(classicButtons).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Storage unavailable in this test"); }; });
  await classicButtons.click();
  await expect(page.locator("html")).toHaveAttribute("data-visual-style", "glass");
  await expect(glassButtons).toHaveCount(1);
  await expect(glassButtons).toHaveAttribute("aria-pressed", "true");
  // The DOM is the current session's state even when the last persisted value
  // is still classic. The real mobile control must receive that current state.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("nav-menu-button").click();
  const drawer = page.getByRole("dialog", { name: "Primary navigation", exact: true });
  const mobileGlass = drawer.getByRole("button", { name: "Switch to classic appearance", exact: true });
  await expect(mobileGlass).toHaveAttribute("aria-pressed", "true");
  await mobileGlass.click();
  await expect(page.locator("html")).toHaveAttribute("data-visual-style", "classic");
  await expect(drawer.getByRole("button", { name: "Switch to glass appearance", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(classicButtons).toHaveCount(1);
  await expect(classicButtons).toHaveAttribute("aria-pressed", "false");
});

for (const appearance of ["classic", "glass"]) {
  test(`reduced-motion dashboard keeps every content slice visible (${appearance})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((value) => localStorage.setItem("pg_visual_style", value), appearance);
    await page.goto("/en/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-visual-style", appearance);
    await expect.poll(() => page.locator("[data-chrono-enter], [data-chrono-slice], .chrono-slice").evaluateAll((elements) =>
      elements.filter((element) => getComputedStyle(element).opacity !== "1").length
    ), { timeout: 2_000 }).toBe(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}
