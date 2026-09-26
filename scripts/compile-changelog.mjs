#!/usr/bin/env node
/**
 * @file scripts/compile-changelog.mjs
 * @description Release-time CHANGELOG compiler for the noflo monorepo.
 *
 *   Each package owns a CHANGELOG.md scoped to its own changes — contributors
 *   append to `packages/<pkg>/CHANGELOG.md` under `## [Unreleased]`. At release
 *   this script (a) stamps every package's `## [Unreleased]` → `## [<version>]
 *   - <date>` and opens a fresh `## [Unreleased]`, and (b) compiles the just-
 *   stamped `[<version>]` sections across all packages into a single
 *   project-wide root `CHANGELOG.md` (category-first, breaking first; each
 *   entry prefixed with its package).
 *
 *   Packages without an `[Unreleased]` section are left untouched — a release
 *   that doesn't touch a package leaves a version gap in its history (the
 *   lockstep convention) — and contribute nothing to the compiled root.
 *
 *   The root CHANGELOG.md is a generated artifact; it is never hand-edited.
 *
 *   The pure helpers (parseDoc / emitDoc / parseCategories / stampPackage /
 *   buildCompiledSection / compileChangelog) are exported for the release
 *   script and the smoketest to reuse.
 *
 * Usage:
 *   node scripts/compile-changelog.mjs <version> [--date YYYY-MM-DD] [--dry-run] [--root <dir>]
 *
 *   <version>   semver, e.g. 1.6.0
 *   --date      override release date (default: today, ISO)
 *   --dry-run   compute and print without writing anything
 *   --root      monorepo root (default: parent of this script's directory)
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Preferred package order in the compiled output (dependency/layering order). */
const PACKAGE_ORDER = ["noflo"];

/**
 * Compiled category order — breaking changes first for visibility, then Keep a
 * Changelog's conventional order. Unknown categories append in encounter order.
 */
const CATEGORY_ORDER = [
  "Removed (breaking)",
  "Changed (breaking)",
  "Deprecated",
  "Removed",
  "Added",
  "Changed",
  "Fixed",
  "Security",
];

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- pure parsing helpers ------------------------------------------------

/**
 * Split a Keep-a-Changelog document into a title block and `## ` version
 * sections. Leading/trailing blank lines are trimmed from the title and each
 * section body.
 *
 * @param {string} text - Raw CHANGELOG contents.
 * @returns {{ title: string[], sections: { header: string, body: string[] }[] }}
 */
export function parseDoc(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */ const title = [];
  /** @type {{ header: string, body: string[] }[]} */ const sections = [];
  let cur = null;
  for (const line of lines) {
    if (/^## /.test(line)) {
      cur = { header: line, body: [] };
      sections.push(cur);
    } else if (cur) {
      cur.body.push(line);
    } else {
      title.push(line);
    }
  }
  for (const s of sections) {
    while (s.body.length && s.body[0].trim() === "") s.body.shift();
    while (s.body.length && s.body[s.body.length - 1].trim() === "")
      s.body.pop();
  }
  while (title.length && title[title.length - 1].trim() === "") title.pop();
  return { title, sections };
}

/**
 * Re-emit a parsed document: title, then each section as a blank line + header
 * + body, with a single trailing newline.
 *
 * @param {{ title: string[], sections: { header: string, body: string[] }[] }} doc
 * @returns {string}
 */
export function emitDoc(doc) {
  let out = doc.title.join("\n").replace(/\n+$/, "");
  for (const s of doc.sections) {
    out += `\n\n${s.header}`;
    if (s.body.length) out += `\n${s.body.join("\n")}`;
  }
  return `${out}\n`;
}

/**
 * Parse the body of a version section into ordered categories, each with its
 * top-level entry blocks. An entry block is the `- `/`* ` line plus its
 * indented sub-lines (sub-bullets and continuations); blank lines are dropped.
 *
 * @param {string[]} bodyLines
 * @returns {{ name: string, entries: string[][] }[]}
 */
export function parseCategories(bodyLines) {
  /** @type {{ name: string, entries: string[][], current: string[] | null }[]} */
  const cats = [];
  let cur = null;
  for (const line of bodyLines) {
    if (/^### /.test(line)) {
      cur = {
        name: line.replace(/^### /, "").trim(),
        entries: [],
        current: null,
      };
      cats.push(cur);
    } else if (!cur) {
    } else if (/^[-*] /.test(line)) {
      const block = [line];
      cur.entries.push(block);
      cur.current = block;
    } else if (cur.current && /^\s+\S/.test(line)) {
      cur.current.push(line);
    }
    // blank lines and stray non-indented text are dropped
  }
  for (const c of cats) {
    for (const block of c.entries) {
      while (block.length && block[block.length - 1].trim() === "") block.pop();
    }
  }
  return cats;
}

/**
 * Stamp a package CHANGELOG: rename `## [Unreleased]` → `## [<version>] -
 * <date>` and open a fresh `## [Unreleased]` on top.
 *
 * @param {string} text - Raw package CHANGELOG contents.
 * @param {string} version
 * @param {string} date - ISO `YYYY-MM-DD`.
 * @returns {string | null} The stamped text, or `null` if there is no
 *   `[Unreleased]` section (nothing to release for this package).
 */
export function stampPackage(text, version, date) {
  const doc = parseDoc(text);
  const idx = doc.sections.findIndex((s) =>
    s.header.startsWith("## [Unreleased]"),
  );
  if (idx === -1) return null;
  doc.sections[idx].header = `## [${version}] - ${date}`;
  doc.sections.splice(idx, 0, { header: "## [Unreleased]", body: [] });
  return emitDoc(doc);
}

/**
 * Build the compiled `## [<version>]` section text from per-package category
 * data, grouped by category (breaking first) with each entry prefixed by its
 * package as `- **<pkg>**: …`.
 *
 * @param {string} version
 * @param {string} date
 * @param {{ pkg: string, cats: { name: string, entries: string[][] }[] }[]} perPkg
 * @returns {string}
 */
export function buildCompiledSection(version, date, perPkg) {
  /** @type {Map<string, { pkg: string, block: string[] }[]>} */
  const merged = new Map();
  /** @type {string[]} */ const order = [];
  for (const { pkg, cats } of perPkg) {
    for (const cat of cats) {
      if (!merged.has(cat.name)) {
        merged.set(cat.name, []);
        order.push(cat.name);
      }
      for (const block of cat.entries)
        merged.get(cat.name).push({ pkg, block });
    }
  }
  const priority = (/** @type {string} */ name) => {
    const i = CATEGORY_ORDER.indexOf(name);
    return i === -1 ? CATEGORY_ORDER.length + order.indexOf(name) : i;
  };
  const sorted = order.slice().sort((a, b) => priority(a) - priority(b));

  let out = `## [${version}] - ${date}`;
  for (const name of sorted) {
    const entries = merged.get(name);
    if (!entries || entries.length === 0) continue;
    out += `\n### ${name}`;
    for (const { pkg, block } of entries) {
      const prefixed = block.map((line, i) =>
        i === 0 ? line.replace(/^([-*]) /, `$1 **${pkg}**: `) : line,
      );
      out += `\n${prefixed.join("\n")}`;
    }
  }
  return out;
}

// --- driver --------------------------------------------------------------

/** @param {string} root */
function discoverPackages(root) {
  const dir = join(root, "packages");
  if (!existsSync(dir)) return [];
  const all = readdirSync(dir).filter((d) => {
    const p = join(dir, d);
    return statSync(p).isDirectory() && existsSync(join(p, "CHANGELOG.md"));
  });
  return all.sort((a, b) => {
    const ia = PACKAGE_ORDER.indexOf(a);
    const ib = PACKAGE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Run the compile for a given version: stamp each package CHANGELOG and write
 * (or, with `dryRun`, just compute) the compiled root CHANGELOG.
 *
 * @param {{ version: string, date?: string, root?: string, dryRun?: boolean, log?: (msg: string) => void }} opts
 * @returns {{ version: string, date: string, stamped: string[], skipped: { pkg: string, reason: string }[], rootPath: string, rootText: string, compiledSection: string }}
 */
export function compileChangelog({
  version,
  date = new Date().toISOString().slice(0, 10),
  root = DEFAULT_ROOT,
  dryRun = false,
  log = (m) => console.log(m),
}) {
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Invalid version "${version}" (expected x.y.z)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}" (expected YYYY-MM-DD)`);
  }

  const packages = discoverPackages(root);
  if (packages.length === 0) {
    throw new Error(
      `No packages with a CHANGELOG.md found under ${join(root, "packages")}`,
    );
  }

  /** @type {{ pkg: string, cats: { name: string, entries: string[][] }[] }[]} */
  const perPkg = [];
  /** @type {string[]} */ const stamped = [];
  /** @type {{ pkg: string, reason: string }[]} */ const skipped = [];

  for (const pkg of packages) {
    const path = join(root, "packages", pkg, "CHANGELOG.md");
    const original = readFileSync(path, "utf8");
    const next = stampPackage(original, version, date);
    if (next === null) {
      skipped.push({ pkg, reason: "no [Unreleased] section" });
      log(`  skip  ${pkg} (no [Unreleased]; leaving a version gap)`);
      continue;
    }
    if (!dryRun) writeFileSync(path, next);
    stamped.push(pkg);
    log(`  stamp ${pkg} -> [${version}]`);
    const doc = parseDoc(next);
    const verSection = doc.sections.find((s) =>
      s.header.startsWith(`## [${version}]`),
    );
    perPkg.push({
      pkg,
      cats: parseCategories(verSection ? verSection.body : []),
    });
  }

  const compiledSection = buildCompiledSection(version, date, perPkg);

  // Assemble the root CHANGELOG (created if absent).
  const rootPath = join(root, "CHANGELOG.md");
  let doc;
  if (existsSync(rootPath)) {
    doc = parseDoc(readFileSync(rootPath, "utf8"));
  } else {
    doc = {
      title: ["# Changelog"],
      sections: [{ header: "## [Unreleased]", body: [] }],
    };
  }
  if (!doc.title.some((l) => /^# /.test(l))) doc.title.unshift("# Changelog");
  const hasUnrel = doc.sections.some((s) =>
    s.header.startsWith("## [Unreleased]"),
  );
  if (!hasUnrel) doc.sections.unshift({ header: "## [Unreleased]", body: [] });
  if (doc.sections.some((s) => s.header.startsWith(`## [${version}]`))) {
    throw new Error(`Version [${version}] already present in ${rootPath}`);
  }
  const newSection = parseDoc(compiledSection).sections[0];
  const unrelIdx = doc.sections.findIndex((s) =>
    s.header.startsWith("## [Unreleased]"),
  );
  doc.sections.splice(unrelIdx + 1, 0, newSection);
  const rootText = emitDoc(doc);

  if (!dryRun) writeFileSync(rootPath, rootText);

  return {
    version,
    date,
    stamped,
    skipped,
    rootPath,
    rootText,
    compiledSection,
  };
}

function printHelp() {
  console.log(
    `Usage: node scripts/compile-changelog.mjs <version> [options]

  <version>           semver to release, e.g. 1.6.0
  --date YYYY-MM-DD   override release date (default: today)
  --dry-run           compute and print without writing
  --root <dir>        monorepo root (default: parent of this script)
`,
  );
}

function main() {
  const args = process.argv.slice(2);
  let version = null;
  let date = new Date().toISOString().slice(0, 10);
  let dryRun = false;
  let root = DEFAULT_ROOT;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--date") date = args[++i];
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

  const mode = dryRun ? "[dry-run]" : "";
  console.log(`Compiling CHANGELOG for v${version} (${date}) ${mode}`);
  const res = compileChangelog({ version, date, root, dryRun });
  console.log(
    `\nCompiled ${res.stamped.length} package(s)` +
      (res.skipped.length ? `, skipped ${res.skipped.length}` : "") +
      ` -> ${res.rootPath}` +
      (dryRun ? " (not written)" : ""),
  );
  if (dryRun) {
    console.log("\n--- compiled section ---\n");
    console.log(res.compiledSection);
    console.log("\n--- resulting root CHANGELOG.md ---\n");
    console.log(res.rootText);
  } else {
    console.log("Done. Review and commit.");
  }
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
