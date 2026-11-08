import { defineConfig, devices } from "@playwright/test";

const baseline = process.env.MVP_AUTH_BASELINE === "1";
const dev = process.env.PG_AUTH_DEV === "1";
const port = process.env.PG_AUTH_PORT || (baseline ? "3207" : "3206");
const frozen = process.env.MVP_AUTH_BASELINE_ROOT;
if (baseline && !frozen) throw new Error("Set MVP_AUTH_BASELINE_ROOT to the frozen standalone web directory");
const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;

export default defineConfig({
  testDir: "../../tests/e2e/playwright",
  testMatch: "auth-onboarding.spec.ts",
  timeout: 60_000,
  expect: { timeout: baseline ? 5_000 : 15_000 },
  workers: 1,
  reporter: "list",
  outputDir: baseline ? "test-results/auth-baseline" : "test-results/auth-onboarding",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    actionTimeout: baseline ? 5_000 : 15_000,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {}),
  },
  webServer: {
    command: baseline
      ? `node --require ${quote(`${frozen}/tests/offline-fetch-guard.cjs`)} ${quote(`${frozen}/.next-build/standalone/server.js`)}`
      : dev
        ? `node --require ./tests/offline-fetch-guard.cjs node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`
        : "node --require ./tests/offline-fetch-guard.cjs .next-build/standalone/server.js",
    url: `http://127.0.0.1:${port}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { HOSTNAME: "127.0.0.1", PORT: port, NEXT_PUBLIC_API_URL: "/api", NEXT_TELEMETRY_DISABLED: "1", REQUIRE_AUTH: "true" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
});
