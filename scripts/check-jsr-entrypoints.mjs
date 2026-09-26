#!/usr/bin/env node
/**
 * @file scripts/check-jsr-entrypoints.mjs
 * @description Guard against the two JSR-score regressions the reticulum-js
 *   monorepo repeatedly hit when adding a new `jsr.json` export:
 *
 *   1. **Missing `@ts-self-types` pointer** — every JS entrypoint that lacks a
 *      `/* @ts-self-types="…" *​/` pointer to its generated `.d.ts` is flagged
 *      by JSR as an `unsupported-javascript-entrypoint` *slow type*. A package
 *      with slow types cannot score above ~70%, so a single forgotten pointer
 *      silently tanks the whole package's JSR score. This is exactly the check
 *      the `jsr publish --dry-run` slow-type warnings report, but it runs
 *      offline (no deno, no network, no jsr download) in milliseconds.
 *   2. **Missing leading module doc** — JSR's "has module docs in all
 *      entrypoints" score component requires a `/** … *​/` block as the very
 *      first thing in every entrypoint module. A doc comment placed *after*
 *      the imports does not count.
 *
 *   When the package's generated declarations are present (CI regenerates
 *   them before tests), the referenced `.d.ts` is also verified to exist — a
 *      pointer to a declaration tsc never emits still leaves the slow type in
 *      place.
 *
 *   Wired into the root `test` script (see package.json), so every `npm test`
 *   — local, CI, and the release checks — fails fast on a regression. No-ops
 *   (green) while no package ships a `jsr.json` yet.
 *
 * Usage:
 *   node scripts/check-jsr-entrypoints.mjs [root]
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Matches `/* @ts-self-types="<rel-path>" *​/` (single or double quotes). */
const SELF_TYPES_RE = /@ts-self-types\s*=\s*["']([^"']+)["']/;

/**
 * Resolve a single `exports` entry's value to the JS file it points at, or
 * `null` if it isn't a plain JS entrypoint (conditional exports / `.ts` / etc.,
 * which this check doesn't apply to).
 *
 * @param {string} pkgDir
 * @param {unknown} value
 * @returns {string | null}
 */
function resolveEntrypointFile(pkgDir, value) {
  if (typeof value !== "string" || !value.endsWith(".js")) return null;
  return join(pkgDir, value);
}

/**
 * Check one package's JSR entrypoints.
 *
 * @param {string} pkgDir
 * @returns {{ pkg: string, key: string, file: string, kind: string, dts?: string }[]}
 *   Problem descriptors (empty when the package is clean). Pure + filesystem
 *   only, so it is unit-testable against a temp tree.
 */
export function checkPackage(pkgDir) {
  const jsrPath = join(pkgDir, "jsr.json");
  if (!existsSync(jsrPath)) return [];
  const jsr = JSON.parse(readFileSync(jsrPath, "utf8"));
  const pkg = jsr.name || basename(pkgDir);
  const exports = jsr.exports || {};
  const hasTypesDir = existsSync(join(pkgDir, "types"));

  const problems = [];
  for (const [key, value] of Object.entries(exports)) {
    const file = resolveEntrypointFile(pkgDir, value);
    if (!file) continue;
    if (!existsSync(file)) {
      problems.push({ pkg, key, file, kind: "missing-file" });
      continue;
    }
    const src = readFileSync(file, "utf8");
    const hasModuleDoc = /^\s*\/\*\*/.test(src);
    const selfTypes = src.match(SELF_TYPES_RE);
    if (!hasModuleDoc) {
      problems.push({ pkg, key, file, kind: "no-module-doc" });
    }
    if (!selfTypes) {
      problems.push({ pkg, key, file, kind: "no-ts-self-types" });
    } else if (hasTypesDir) {
      // Pointer present AND types generated — the referenced .d.ts must exist,
      // else JSR still flags the entrypoint as a slow type.
      const dts = resolve(dirname(file), selfTypes[1]);
      if (!existsSync(dts)) {
        problems.push({ pkg, key, file, kind: "missing-dts", dts });
      }
    }
  }
  return problems;
}

/**
 * Check every `packages/*` that ships a `jsr.json`.
 *
 * @param {string} root
 * @returns {{ pkg: string, key: string, file: string, kind: string, dts?: string }[]}
 */
export function checkAll(root) {
  const dir = join(root, "packages");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const pkgDir = join(dir, name);
    if (statSync(pkgDir).isDirectory()) out.push(...checkPackage(pkgDir));
  }
  return out;
}

const HOWTO =
  "Fix: make the /** … */ module doc the very first thing in the file, and add\n" +
  '     a /* @ts-self-types="…" */ pointer to the generated .d.ts (the path is\n' +
  "     relative to the source file). Then regenerate declarations and re-run\n" +
  "     this check.";

/**
 * @param {string} root
 * @returns {number} exit code (0 = clean, 1 = problems found)
 */
function main(root) {
  const problems = checkAll(root);
  if (problems.length === 0) {
    console.log(
      "✓ All JSR entrypoints have a leading module doc and a @ts-self-types pointer.",
    );
    return 0;
  }
  console.error(`✗ ${problems.length} JSR entrypoint problem(s):\n`);
  for (const p of problems) {
    const rel = relative(root, p.file);
    switch (p.kind) {
      case "no-module-doc":
        console.error(
          `  ${p.pkg}  ${rel}  — no leading /** module doc (JSR "module docs in all entrypoints")`,
        );
        break;
      case "no-ts-self-types":
        console.error(
          `  ${p.pkg}  ${rel}  — no @ts-self-types pointer (causes an unsupported-javascript-entrypoint slow type; caps the JSR score)`,
        );
        break;
      case "missing-dts":
        console.error(
          `  ${p.pkg}  ${rel}  — @ts-self-types points at ${relative(root, p.dts)} which tsc did not emit`,
        );
        break;
      case "missing-file":
        console.error(
          `  ${p.pkg}  ${rel}  — exports entrypoint file does not exist`,
        );
        break;
      default:
        console.error(`  ${p.pkg}  ${rel}  — ${p.kind}`);
    }
  }
  console.error(`\n${HOWTO}`);
  return 1;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_ROOT;
  process.exit(main(root));
}
