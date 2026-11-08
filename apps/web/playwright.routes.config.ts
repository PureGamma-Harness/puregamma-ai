import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const port = process.env.PG_ROUTE_PORT || "3215";
const serverRoot = resolve(process.env.PG_ROUTE_SERVER_ROOT || process.cwd());
const quote = (text: string) => `'${text.replace(/'/g, `'"'"'`)}'`;

export default defineConfig({
  testDir: "../../tests/e2e/playwright",
  testMatch: "route-health.spec.ts",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  workers: 1,
  fullyParallel: false,
  outputDir: "test-results/route-health",
  reporter: [["list"], ["json", { outputFile: "test-results/route-health-results.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}),
  },
  webServer: {
    command: `node --require ${quote(resolve(serverRoot, "tests/offline-fetch-guard.cjs"))} ${quote(resolve(serverRoot, ".next-build/standalone/server.js"))}`,
    cwd: serverRoot,
    url: `http://127.0.0.1:${port}/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    env: { HOSTNAME: "127.0.0.1", PORT: port, REQUIRE_AUTH: "true", NEXT_TELEMETRY_DISABLED: "1" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, colorScheme: "dark" } },
    { name: "mobile390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 }, colorScheme: "light" } },
  ],
});
