// (c) 2021-2026 Henri Bergius
/**
 * @file scripts/run-playwright.mjs
 * @description Opt-in launcher for the browser tests (work document #18).
 *
 *   Playwright is deliberately NOT a devDependency: the browser tests are
 *   opt-in (the tooling does not install on every development environment —
 *   Termux/Android in particular), so this launcher fetches the pinned
 *   Playwright version on demand and runs `playwright test` against the
 *   no-build fixture in Firefox.
 *
 *   Modes:
 *   - `npm run test:browser` — local: skip with a notice when Firefox is
 *     not installed for Playwright (never surprises an environment that
 *     cannot host browsers); otherwise run the tests.
 *   - `npm run test:browser -- --ensure` — CI: install Firefox first (with
 *     system dependencies on CI runners), then always run.
 *
 *   The test always runs in the CI "Test with Firefox" job on every push;
 *   agents and developers run the default mode when their environment can
 *   host Firefox and the change touches the browser-reachable surface.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Pinned so the browser binaries and the runner version always match. */
const PLAYWRIGHT_VERSION = "1.64.0";
/** The one browser the fixture verification runs in. */
const BROWSER = "firefox";

/**
 * Locate the Playwright browser cache directory for this platform, or null
 * when it does not exist.
 *
 * @returns {string | null}
 */
function browserCacheDir() {
  const candidates = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? [process.env.PLAYWRIGHT_BROWSERS_PATH]
    : [
        join(process.env.HOME ?? "", "Library", "Caches", "ms-playwright"),
        join(process.env.HOME ?? "", ".cache", "ms-playwright"),
      ];
  for (const dir of candidates) {
    if (dir && existsSync(dir)) return dir;
  }
  return null;
}

/**
 * Run a command, inheriting stdio.
 *
 * @param {string} command
 * @returns {number} Exit status
 */
function run(command) {
  console.log(`  $ ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  return result.status ?? 1;
}

const ensure = process.argv.includes("--ensure");
const cacheDir = browserCacheDir();
// The cache may hold browsers from other projects; only a Firefox
// installation counts for this run.
const hasBrowser =
  cacheDir !== null &&
  readdirSync(cacheDir, { withFileTypes: true }).some(
    (e) => e.isDirectory() && e.name.startsWith(`${BROWSER}-`),
  );

if (!hasBrowser && !ensure) {
  console.log(
    `Playwright ${BROWSER} not installed — skipping the browser tests (work document #18).\n` +
      "They run in CI on every push; to run locally, use `npm run test:browser -- --ensure`.",
  );
  process.exit(0);
}

console.log(`Browser tests: the no-build fixture (#18) in ${BROWSER}`);

// The test files import `@playwright/test`, so the runner needs it
// resolvable from the project. It is intentionally not a devDependency
// (the browser tests are opt-in and the tooling does not fit every
// development environment), so install it into the gitignored
// node_modules without touching package.json or the lockfile. Installing
// it first also satisfies Playwright's "install your dependencies before
// running playwright install" expectation.
if (!existsSync(join(root, "node_modules", "@playwright", "test"))) {
  const status = run(
    `npm install --no-save @playwright/test@${PLAYWRIGHT_VERSION}`,
  );
  if (status !== 0) {
    console.error("@playwright/test installation failed");
    process.exit(status);
  }
}

if (!hasBrowser) {
  // --with-deps installs the OS-level packages Firefox needs; that path
  // requires root, so it is reserved for CI runners.
  const withDeps = process.env.CI ? " --with-deps" : "";
  const status = run(`npx playwright install${withDeps} ${BROWSER}`);
  if (status !== 0) {
    console.error(`Playwright ${BROWSER} installation failed`);
    process.exit(status);
  }
}

// The local install puts the playwright CLI on node_modules/.bin, where
// npx prefers it over a cache fetch, keeping the run scoped to this repo.
process.exit(run("npx playwright test"));
