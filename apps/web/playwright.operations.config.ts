import { defineConfig, devices } from "@playwright/test";

const standalone = process.env.PG_OPERATIONS_STANDALONE === "1";
const port = process.env.PG_OPERATIONS_PORT || "3213";

export default defineConfig({
  testDir: "../../tests/e2e/playwright",
  testMatch: "operations-mvp.spec.ts",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: standalone
      ? "node --require ./tests/offline-fetch-guard.cjs .next-build/standalone/server.js"
      : `node --require ./tests/offline-fetch-guard.cjs ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { HOSTNAME: "127.0.0.1", PORT: port, NEXT_PUBLIC_API_URL: "/api", NEXT_PUBLIC_INITIAL_LAUNCH_MODE: "false", REQUIRE_AUTH: "true", NEXT_TELEMETRY_DISABLED: "1" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
});
