#!/usr/bin/env node
/**
 * (c) 2021-2026 Henri Bergius
 * @file scripts/release.js
 * @description Cut a lockstep release across the noflo monorepo.
 *
 *   This is the one command a maintainer runs to ship a new version. It does
 *   every local step and then hands off the (interactive, mesh) publish:
 *
 *     1. pre-flight  — clean tree, tag v<version> not taken, packages lockstep
 *     2. checks      — npm run lint / npm test, plus a JSR publish dry-run
 *                      and a symbol-doc coverage gate (≥80%) when deno is
 *                      installed and any package ships a jsr.json
 *                      (skip with --skip-checks)
 *     3. version     — bump every packages/<pkg>/package.json (and jsr.json,
 *                      when present) to <version> and rewrite internal
 *                      workspace dependency refs in the companions'
 *                      package.json ("^old" -> "^<version>") (jsr.json deps
 *                      use jsr: ranges and are left untouched)
 *     4. changelog   — compile-changelog: stamp each package's [Unreleased] ->
 *                      [<version>] and compile a root CHANGELOG.md
 *     5. notes       — write the compiled [<version>] section to
 *                      RELEASE_NOTES.md (root) for pasting into the rngit
 *                      release-notes editor
 *     6. lockfile    — npm install --package-lock-only (best-effort)
 *     7. commit/tag  — one "release v<version>" commit + tag v<version>
 *     8. pack        — regenerate declarations (gitignored, adjacent .d.ts)
 *                      then npm pack --workspaces --pack-destination dist
 *     9. push        — git push origin HEAD --tags, pushing the current
 *                      branch (rngit refuses to create a release for a tag
 *                      that isn't in its git source repo yet)
 *    10. publish     — copies the compiled release notes to the clipboard and
 *                      runs `rngit release <repo> create v<ver>:dist` (which
 *                      opens an editor — just paste). --no-publish defers it.
 *                      GitHub is mirrored automatically by a 3rd-party process,
 *                      and the v* tag there triggers the npm/JSR mirror
 *                      workflow.
 *
 *   --dry-run performs no mutations; it prints the plan and previews each
 *   tarball's contents via `npm pack --dry-run`.
 *
 * Usage:
 *   node scripts/release.js <version> [--date YYYY-MM-DD] [--skip-checks]
 *                                    [--repo <rns-url>] [--dry-run] [--root <dir>]
 */

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileChangelog } from "./compile-changelog.js";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const today = () => new Date().toISOString().slice(0, 10);

// --- pure helpers (exported for the smoketest) ---------------------------

/**
 * Return a cloned package.json object with `version` bumped and any internal
 * workspace dependency ref rewritten to `^<newVersion>`. External deps and all
 * other fields are untouched. Does not mutate the input.
 *
 * @param {Record<string, any>} pkg - Parsed package.json.
 * @param {string} newVersion
 * @param {string[]} [internalPackages] - Workspace package names to rewrite.
 * @returns {Record<string, any>}
 */
export function applyVersionBump(pkg, newVersion, internalPackages = []) {
  const next = { ...pkg, version: newVersion };
  // Internal workspace references are kept in caret lockstep across every
  // dependency section: runtime deps, dev deps (workspace packages used in
  // specs), and peer deps (loader packages require the core).
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ]) {
    if (!pkg[section]) continue;
    next[section] = { ...pkg[section] };
    for (const dep of internalPackages) {
      if (dep in next[section]) next[section][dep] = `^${newVersion}`;
    }
  }
  return next;
}

// --- fs / git / npm shims ------------------------------------------------

/** @param {string} path */
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJSON = (path, obj) =>
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);

/**
 * @param {string} cmd
 * @param {import("node:child_process").ExecSyncOptions} [opts]
 * @returns {string}
 */
function run(cmd, opts) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}
/** Like run(), but returns null on non-zero exit instead of throwing. */
function tryRun(cmd, opts) {
  try {
    return run(cmd, opts);
  } catch {
    return null;
  }
}

/** @param {string} root */
export function packageMetas(root) {
  const dir = join(root, "packages");
  return readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory())
    .map((name) => {
      const path = join(dir, name, "package.json");
      const jsrPath = join(dir, name, "jsr.json");
      const hasJsr = existsSync(jsrPath);
      return {
        name,
        path,
        json: readJSON(path),
        jsrPath: hasJsr ? jsrPath : null,
        jsrJson: hasJsr ? readJSON(jsrPath) : null,
      };
    });
}

/**
 * Names of the workspace packages — the dependency refs that a version bump
 * must rewrite in companion packages. Discovered dynamically so new packages
 * are picked up without touching this script.
 * @param {string} root
 * @returns {string[]}
 */
export function discoverInternalPackages(root) {
  return packageMetas(root)
    .map((m) => m.json.name)
    .filter(Boolean);
}

/** @param {string} root */
function gitClean(root) {
  const out = tryRun("git status --porcelain", { cwd: root });
  return out !== null && out.trim() === "";
}
/** @param {string} root @param {string} tag */
function tagExists(root, tag) {
  return (
    tryRun(`git rev-parse -q --verify refs/tags/${tag}`, { cwd: root }) !== null
  );
}

/**
 * The rngit source repo to publish to is the git "origin" remote — not the
 * public mirror advertised in package.json#repository (that is where releases
 * get *mirrored*, not where they are published from).
 * @param {string} root
 * @returns {string | null}
 */
export function gitOriginUrl(root) {
  const out = tryRun("git remote get-url origin", { cwd: root });
  return out === null ? null : out.trim();
}

/**
 * Run `npm pack --dry-run` in a package dir and return the list of files that
 * would be packed (the "Tarball Contents" block).
 * @param {string} pkgDir
 * @returns {string[]}
 */
function packPreview(pkgDir) {
  const out = tryRun("npm pack --dry-run 2>&1", { cwd: pkgDir });
  if (!out) return [];
  const lines = out.split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes("Tarball Contents"));
  if (start === -1) return [];
  const end = lines.findIndex(
    (l, i) => i > start && l.includes("Tarball Details"),
  );
  return lines
    .slice(start + 1, end === -1 ? lines.length : end)
    .map((l) => l.replace(/^npm notice\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Best-effort copy text into the system clipboard using whichever OS tool is
 * available. Returns the command that worked, or null if none did (the caller
 * then falls back to pointing at the RELEASE_NOTES.md file). Uses only
 * system-provided tools — no npm dependency.
 * @param {string} text
 * @returns {string | null}
 */
function copyToClipboard(text) {
  /** @type {Record<string, string[]>} */
  const tools = {
    darwin: ["pbcopy"],
    win32: ["clip"],
    linux: [
      "wl-copy",
      "xclip -selection clipboard",
      "xsel --clipboard --input",
    ],
  };
  for (const cmd of tools[process.platform] || []) {
    try {
      execSync(cmd, { input: text, stdio: ["pipe", "ignore", "ignore"] });
      return cmd;
    } catch {
      // try the next available tool
    }
  }
  return null;
}

// --- orchestration -------------------------------------------------------

/**
 * @param {{ version: string, date?: string, root?: string, dryRun?: boolean, skipChecks?: boolean, noPublish?: boolean, repo?: string }} opts
 */
export function runRelease({
  version,
  date = today(),
  root = DEFAULT_ROOT,
  dryRun = false,
  skipChecks = false,
  noPublish = false,
  repo,
}) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    throw new Error(`Invalid version "${version}" (expected x.y.z)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}" (expected YYYY-MM-DD)`);
  }

  const metas = packageMetas(root);
  if (metas.length === 0)
    throw new Error(`No packages found under ${join(root, "packages")}`);
  const internalPackages = discoverInternalPackages(root);

  const versions = new Set(metas.map((m) => m.json.version));
  if (versions.size !== 1) {
    throw new Error(
      `Packages are not at one version (lockstep broken): ${metas.map((m) => `${m.name}@${m.json.version}`).join(", ")}`,
    );
  }
  const current = [...versions][0];
  if (current === version) {
    throw new Error(
      `Version ${version} == current ${current}; nothing to release`,
    );
  }

  repo = repo || gitOriginUrl(root);
  if (!repo) {
    throw new Error(
      `No rngit repo configured (pass --repo, or add a git "origin" remote pointing at the rngit source repo)`,
    );
  }

  const tag = `v${version}`;
  if (tagExists(root, tag)) throw new Error(`Git tag ${tag} already exists`);
  if (!dryRun && !gitClean(root)) {
    throw new Error("Working tree is dirty. Commit or stash before releasing.");
  }

  console.log(
    `Release ${current} -> ${version} (${date})  [${repo}]${dryRun ? "  [DRY-RUN]" : ""}\n`,
  );

  // 2. checks
  if (!dryRun && !skipChecks) {
    console.log("Checks:");
    for (const c of ["npm run lint", "npm test"]) {
      console.log(`  $ ${c}`);
      run(c, { cwd: root, stdio: "inherit" });
    }
    // JSR publish dry-run — catches missing `exports` subpaths and unresolved
    // module-graph errors *before* a tag is cut. The npm/JSR publish workflow
    // only publishes in CI after the tag is pushed, so this surfaces such
    // failures locally instead. Skipped silently when deno isn't installed
    // (the helper itself needs deno) or when no package ships a jsr.json yet.
    const hasJsr = metas.some((m) => m.jsrJson !== null);
    const denoVer = hasJsr ? tryRun("deno --version", { cwd: root }) : null;
    if (denoVer) {
      const dv = denoVer.match(/deno\s+([\d.]+)/)?.[1] ?? "?";
      console.log(`  $ jsr publish --dry-run  (deno ${dv})`);
      run(`bash "${join(root, "scripts", "jsr-dryrun.sh")}"`, {
        cwd: root,
        stdio: "inherit",
      });
      // Symbol-doc coverage gate (JSR scores "has docs for most symbols"
      // with the same deno-doc engine; this catches regressions before a
      // tag is cut). Gated at 80% since the type-surface audit (work
      // document #7) closed the gap on every workspace package.
      console.log(`  $ jsr-doc-coverage --min 80`);
      run(`node "${join(root, "scripts", "jsr-doc-coverage.js")}" --min 80`, {
        cwd: root,
        stdio: "inherit",
      });
    } else {
      console.log(
        "  jsr publish --dry-run: skipped (no deno or no JSR packages)",
      );
    }
    console.log();
  }

  // 3. version bump (package.json + jsr.json) + internal dep ref rewrite
  //    (package.json only: jsr.json uses jsr: range specifiers for deps, so we
  //    only touch its version field and leave dependencies as-is)
  console.log("Version bump:");
  for (const m of metas) {
    /** @type {{path: string, json: Record<string, any>, isJsr: boolean}[]} */
    const manifests = [{ path: m.path, json: m.json, isJsr: false }];
    if (m.jsrJson)
      manifests.push({ path: m.jsrPath, json: m.jsrJson, isJsr: true });
    for (const { path, json, isJsr } of manifests) {
      const after = applyVersionBump(
        json,
        version,
        isJsr ? [] : internalPackages,
      );
      const depNotes = Object.entries(json.dependencies ?? {})
        .filter(
          ([dep, before]) =>
            internalPackages.includes(dep) &&
            /** @type {string} */ (before) !== after.dependencies?.[dep],
        )
        .map(
          ([dep, before]) =>
            `  (${dep} dep ${/** @type {string} */ (before)} -> ${after.dependencies?.[dep]})`,
        )
        .join("");
      const label = isJsr ? " jsr.json" : "";
      console.log(
        `  ${m.name}${label}: ${json.version} -> ${version}${depNotes}`,
      );
      if (!dryRun) writeJSON(path, after);
    }
  }
  console.log();

  // 4. changelog compile (stamps packages, writes root CHANGELOG.md)
  console.log("Changelog:");
  const cl = compileChangelog({ version, date, root, dryRun });
  console.log();

  // 5. release notes (for pasting into the rngit release editor)
  const notesPath = join(root, "RELEASE_NOTES.md");
  if (dryRun) {
    console.log(`Release notes (would write to ${notesPath}):`);
    console.log(cl.compiledSection);
    console.log();
  } else {
    writeFileSync(notesPath, `${cl.compiledSection}\n`);
    console.log(
      `Wrote release notes -> ${notesPath} (paste into rngit editor)\n`,
    );
  }

  // 6. lockfile sync (best-effort)
  if (!dryRun) {
    console.log("Syncing package-lock.json...");
    if (
      tryRun("npm install --package-lock-only", {
        cwd: root,
        stdio: "ignore",
      }) === null
    ) {
      console.log(
        "  ⚠ npm install --package-lock-only failed (offline?) — update the lockfile manually.",
      );
    } else {
      console.log("  ok");
    }
    console.log();
  }

  // 7. commit + tag
  if (dryRun) {
    console.log(
      "Would commit + tag: packages/*/package.json packages/*/jsr.json packages/*/CHANGELOG.md CHANGELOG.md package-lock.json\n",
    );
  } else {
    console.log("Committing release...");
    run(
      "git add packages/*/package.json packages/*/jsr.json packages/*/CHANGELOG.md CHANGELOG.md package-lock.json",
      {
        cwd: root,
      },
    );
    run(`git commit -m "release ${tag}"`, { cwd: root, stdio: "inherit" });
    run(`git tag ${tag}`, { cwd: root });
    console.log(`Committed + tagged ${tag}\n`);
  }

  // 8. pack
  const dist = join(root, "dist");
  if (dryRun) {
    console.log("Tarball contents (npm pack --dry-run):");
    for (const m of metas) {
      const files = packPreview(join(root, "packages", m.name));
      console.log(`  ${m.name} (${files.length} files):`);
      for (const f of files) console.log(`    ${f}`);
    }
    console.log();
  } else {
    // Generated declarations (adjacent `.d.ts` files under each package's
    // `src/`) are gitignored and not committed — always regenerate before
    // packing so the tarballs ship current types even when checks were
    // skipped. The per-package `.npmignore` files make npm pack include
    // them despite the .gitignore.
    console.log("Generating declarations...");
    run("npm run types --workspaces --if-present", {
      cwd: root,
      stdio: "inherit",
    });
    console.log();
    console.log("Packing tarballs -> dist/...");
    rmSync(dist, { recursive: true, force: true });
    mkdirSync(dist, { recursive: true });
    run("npm pack --workspaces --pack-destination dist", {
      cwd: root,
      stdio: "inherit",
    });
    console.log();
  }

  // 9. push the commit + tag to the rngit git source (origin). rngit refuses
  //    to create a release for a tag that isn't in the repo yet, so this must
  //    happen *before* `rngit release create`.
  if (dryRun || noPublish) {
    console.log("── Publish (run manually) ──");
    console.log(
      `  git push origin HEAD --tags     # push tag to rngit git source first`,
    );
    console.log(
      `  rngit release ${repo} create ${tag}:dist   # canonical (mesh)`,
    );
    console.log(
      `  paste ${notesPath} (or the clipboard) into the release-notes editor`,
    );
    return;
  }

  console.log("Pushing release commit + tag to origin (rngit git source)...");
  // Push the current branch whatever it is called (master, main, a release
  // branch) — a hardcoded branch name breaks on every repo that differs.
  run("git push origin HEAD --tags", { cwd: root, stdio: "inherit" });
  console.log();

  const copied = copyToClipboard(cl.compiledSection);
  if (copied) {
    console.log(
      `Release notes copied to clipboard (via ${copied}) — paste into the editor.`,
    );
  } else {
    console.log(
      `Clipboard unavailable on this platform — paste ${notesPath} into the editor.`,
    );
  }
  console.log();
  console.log("Opening rngit release (an editor will open for the notes)...");
  run(`rngit release ${repo} create ${tag}:dist`, {
    cwd: root,
    stdio: "inherit",
  });
  console.log();
  console.log(
    "rngit release published. GitHub is mirrored automatically by a 3rd-party process.",
  );
}

function printHelp() {
  console.log(
    `Usage: node scripts/release.js <version> [options]

  <version>           semver to release, e.g. 1.6.0
  --date YYYY-MM-DD   override release date (default: today)
  --skip-checks       do not run lint/tests before releasing
  --no-publish        stop after packing; print the rngit command instead of
                      running it (default: publish interactively)
  --repo <rns-url>    override the rngit repo (default: git "origin" remote URL)
  --dry-run           plan only; no writes, no commit, no pack (previews tarballs)
  --root <dir>        monorepo root (default: parent of this script)
`,
  );
}

function main() {
  const args = process.argv.slice(2);
  let version = null;
  let date = null;
  let dryRun = false;
  let skipChecks = false;
  let noPublish = false;
  let repo = null;
  let root = DEFAULT_ROOT;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--date") date = args[++i];
    else if (a === "--skip-checks") skipChecks = true;
    else if (a === "--no-publish") noPublish = true;
    else if (a === "--repo") repo = args[++i];
    else if (a === "--root") root = resolve(args[++i]);
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (!version) version = a;
    else {
      console.error(`Unexpected argument: ${a}`);
      printHelp();
      process.exit(1);
    }
  }
  if (!version) {
    printHelp();
    process.exit(1);
  }
  try {
    runRelease({
      version,
      date: date || undefined,
      dryRun,
      skipChecks,
      noPublish,
      repo,
      root,
    });
  } catch (err) {
    console.error(`\n✖ ${err.message}`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
