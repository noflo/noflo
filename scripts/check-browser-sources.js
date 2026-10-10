#!/usr/bin/env node
/**
 * (c) 2021-2026 Henri Bergius
 * @file scripts/check-browser-sources.js
 * @description Guard for the no-build browser compatibility contract
 *   (work document #18): the packages a browser imports directly —
 *   `@noflo/noflo`, `@noflo/graph`, `@noflo/fbp` (plus the authoring helper
 *   `@noflo/as-component`, which runs wherever noflo runs) — must operate as
 *   plain ES modules with zero build step, under strict CSP.
 *
 *   The check enforces, on every runtime `.js` file under each package's
 *   `src/`:
 *
 *   1. **No `node:` imports** — the browser path is dependency-free standard
 *      ESM; a Node builtin import only loads on the server.
 *   2. **No `eval()` / `new Function`** — CSP friendliness; component source
 *      evaluation stays server-side in `@noflo/loader-node`.
 *   3. **No CommonJS `require()`** — plain ESM only.
 *   4. **No unreviewed Node `process` global access** — `process.*` is only
 *      allowed in files on the reviewed allowlist, where every use is behind
 *      a runtime guard (`typeof process`). A new file
 *      reaching for `process` fails here and must either drop the Node-ism or
 *      be consciously reviewed onto the allowlist.
 *
 *   Server-side-only packages (`@noflo/loader-node`, `@noflo/fbp-spec-runner`)
 *   are out of scope: they are the pieces that *may* use Node APIs.
 *
 *   Comments and `*.d.ts` type-only files are ignored. Wired into the root
 *   `test` script next to `check:jsr`, so every `npm test` fails fast on a
 *   regression.
 *
 * Usage:
 *   node scripts/check-browser-sources.js [root]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Packages whose `src/` trees are browser-reachable and therefore guarded.
 * The loader and the spec runner are the server side of the split and are
 * deliberately not listed.
 *
 * @type {string[]}
 */
const BROWSER_PACKAGES = ["noflo", "graph", "fbp", "as-component"];

/**
 * Files where Node `process` global access is allowed: every use is behind a
 * runtime guard (a `typeof process` capability check), reviewed as part
 * of #18's Node-isms audit. Keep this list short — prefer guarding-free code.
 *
 * @type {string[]}
 */
const PROCESS_ALLOWLIST = [
  "packages/noflo/src/lib/Platform.js",
  "packages/noflo/src/components/Subgraph.js",
  "packages/noflo/src/lib/logger.js",
];

/**
 * Node.js `process` global members worth guarding. Domain vocabulary elsewhere
 * in the sources (a graph node is a "process" with `.component`/`.id`/... in
 * the FBP sense) must not trip this, so the check matches only known
 * Node-global members. Exotic members not on this list are caught by the real
 * browser test job rather than this lint.
 *
 * @type {string}
 */
const PROCESS_MEMBERS =
  "env|exit|exitCode|nextTick|versions|execPath|execArgv|platform|argv|cwd|chdir|pid|ppid|hrtime|uptime|stdout|stderr|stdin|on|once|kill|abort|umask|memoryUsage|cpuUsage|constrainedMemory|availableMemory|title|config|release|binding|emitWarning|report|getBuiltinModule|dlopen|noDeprecation|throwDeprecation|traceDeprecation|features|permission|mainModule|connected|disconnect|debugPort";

const CHECKS = /** @type {const} */ ([
  { kind: "node-import", re: /["']node:[^"']+["']/ },
  { kind: "eval", re: /\beval\s*\(/ },
  { kind: "new-function", re: /new\s+Function\b/ },
  { kind: "require", re: /\brequire\s*\(/ },
  {
    kind: "process-global",
    re: new RegExp(`\\bprocess\\s*\\.(${PROCESS_MEMBERS})\\b`),
  },
  { kind: "globalthis-process", re: /\bglobalThis\s*\.\s*process\b/ },
]);

/**
 * Strip comments from JS source with a small scanner, recording for each
 * retained character its index in the original source, so findings can be
 * reported with true file line numbers. Strings are left intact (a `//`
 * inside a URL string literal must not start a comment); template literals
 * are treated as opaque.
 *
 * @param {string} src
 * @returns {{ code: string, map: number[] }} `map[i]` is the original index
 *   of `code[i]`
 */
function stripComments(src) {
  let code = "";
  const map = [];
  let state = "code";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === "code") {
      if (ch === "/" && next === "/") {
        state = "line";
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block";
        i++;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        state = ch === "'" ? "single" : ch === '"' ? "double" : "template";
      }
      code += ch;
      map.push(i);
    } else if (state === "line") {
      if (ch === "\n") {
        state = "code";
        code += ch;
        map.push(i);
      }
    } else if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        i++;
      }
    } else {
      // Inside a string literal.
      if (ch === "\\") {
        code += ch + (next ?? "");
        map.push(i);
        if (next !== undefined) {
          map.push(i + 1);
        }
        i++;
        continue;
      }
      if (
        (state === "single" && ch === "'") ||
        (state === "double" && ch === '"') ||
        (state === "template" && ch === "`")
      ) {
        state = "code";
      }
      code += ch;
      map.push(i);
    }
  }
  return { code, map };
}

/**
 * Check one browser-reachable package's runtime sources.
 *
 * @param {string} pkgDir
 * @param {string} root
 * @returns {{ pkg: string, file: string, line: number, kind: string }[]}
 *   Problem descriptors (empty when the package is clean). Pure aside from
 *   reading the tree, so it is unit-testable against a temp dir.
 */
export function checkPackage(pkgDir, root) {
  const pkg = basename(pkgDir);
  const srcDir = join(pkgDir, "src");
  if (!statSync(pkgDir).isDirectory() || !statSync(srcDir).isDirectory()) {
    return [];
  }
  const rel = (file) => relative(root, file).replaceAll("\\", "/");
  const processAllowed = new Set(
    PROCESS_ALLOWLIST.map((p) => resolve(root, p)),
  );

  /** @type {{ pkg: string, file: string, line: number, kind: string }[]} */
  const problems = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const file = join(dir, entry);
      if (statSync(file).isDirectory()) {
        walk(file);
        continue;
      }
      if (!entry.endsWith(".js") || entry.endsWith(".d.ts")) continue;
      const src0 = readFileSync(file, "utf8");
      const { code, map } = stripComments(readFileSync(file, "utf8"));
      for (const { kind, re } of CHECKS) {
        if (kind === "process-global" && processAllowed.has(file)) continue;
        const match = re.exec(code);
        if (!match) continue;
        // Map the match back to its position in the original source for a
        // true line number.
        let lo = 0;
        let hi = map.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (map[mid] <= match.index) lo = mid;
          else hi = mid - 1;
        }
        const line = src0.slice(0, map[lo]).split("\n").length;
        problems.push({ pkg, file: rel(file), line, kind });
        break; // one finding per file is enough to flag it
      }
    }
  };
  walk(srcDir);
  return problems;
}

/**
 * Check every browser-reachable package under `packages/`.
 *
 * @param {string} root
 * @returns {{ pkg: string, file: string, line: number, kind: string }[]}
 */
export function checkAll(root) {
  const dir = join(root, "packages");
  const out = [];
  for (const name of BROWSER_PACKAGES) {
    const pkgDir = join(dir, name);
    try {
      out.push(...checkPackage(pkgDir, root));
    } catch {
      // Package (or its src/) not present — nothing to guard yet.
    }
  }
  return out;
}

const HOWTO =
  "Fix: drop the Node-ism (use platform-neutral Web-standards APIs), or guard\n" +
  "     it behind a `typeof process` capability check and — for `process` access\n" +
  "     only — add the file to PROCESS_ALLOWLIST in this script after review.\n" +
  "     Server-side packages (@noflo/loader-node, @noflo/fbp-spec-runner) are\n" +
  "     out of scope and may use Node APIs freely.";

/**
 * @param {string} root
 * @returns {number} exit code (0 = clean, 1 = problems found)
 */
function main(root) {
  const problems = checkAll(root);
  if (problems.length === 0) {
    console.log(
      "✓ Browser-reachable sources are free of Node-isms (no node: imports, eval, require, or unguarded process access).",
    );
    return 0;
  }
  console.error(`✗ ${problems.length} browser-sources problem(s):\n`);
  const KIND_LABEL = {
    "node-import":
      "imports a node: builtin (browser path must be standard ESM without Node builtins)",
    eval: "calls eval() (breaks strict CSP; source evaluation belongs in @noflo/loader-node)",
    "new-function":
      "uses new Function() (breaks strict CSP; source evaluation belongs in @noflo/loader-node)",
    require: "calls require() (browser path is plain ESM only)",
    "process-global":
      "reaches for the Node `process` global without being on the reviewed allowlist",
    "globalthis-process":
      "reaches for `globalThis.process` without being on the reviewed allowlist",
  };
  for (const p of problems) {
    console.error(
      `  ${p.pkg}  ${p.file}:${p.line}  — ${KIND_LABEL[p.kind] ?? p.kind}`,
    );
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
