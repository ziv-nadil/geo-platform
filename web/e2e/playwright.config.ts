import { defineConfig } from "@playwright/test";

/**
 * One Next dev server per identity (DEV_AUTH_USER_ID is process-wide), see run.sh.
 * Specs live in e2e/<identity>/ and run against E2E_BASE_URL (default http://localhost:3100).
 * Run everything: web/e2e/run.sh   |   one identity: E2E_BASE_URL=... playwright test <identity>
 */
export default defineConfig({
  testDir: ".",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: process.env.E2E_JSON ?? "/tmp/e2e-results.json" }]],
  outputDir: "/tmp/e2e-artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" },
  },
});
