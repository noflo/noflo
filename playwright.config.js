// (c) 2021-2026 Henri Bergius
/**
 * Playwright configuration for the no-build browser fixture (work document
 * #18). Plain object on purpose: the browser tests have no project
 * dependency on Playwright (the launcher fetches it on demand), so the
 * config must not import from `@playwright/test`.
 *
 * Run with: npm run test:browser
 * (the webServer entry starts browser/serve.mjs on port 8077)
 */
export default {
  testDir: "browser/spec",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
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
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
};
