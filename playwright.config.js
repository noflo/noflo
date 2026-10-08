// (c) 2021-2026 Henri Bergius
/**
 * Browser CI verification for work document #18: the no-build fixture page
 * must run the static-registry NoFlo flow to completion in real browsers —
 * no bundler, no build step, plain ES modules resolved through a native
 * import map.
 *
 * Run with: npx playwright test browser/
 * (the webServer entry in playwright.config.js starts browser/serve.mjs)
 *
 * @type {import("@playwright/test").PlaywrightTestConfig}
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "browser/spec",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Record stdout/stderr of the page for debugging fixture failures
  use: {
    baseURL: "http://127.0.0.1:8077",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node browser/serve.mjs 8077",
    url: "http://127.0.0.1:8077/browser/index.html",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
