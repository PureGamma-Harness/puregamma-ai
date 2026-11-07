import { defineConfig, devices } from "@playwright/test";

const port = "3196";

export default defineConfig({
  testDir: "../../tests/e2e/playwright",
  testMatch: "next-upgrade-smoke.spec.ts",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {}),
  },
  webServer: {
    command: "node --require ./tests/offline-fetch-guard.cjs .next-build/standalone/server.js",
    url: `http://127.0.0.1:${port}/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      HOSTNAME: "127.0.0.1",
      PORT: port,
      REQUIRE_AUTH: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
});
