#!/usr/bin/env node
/**
 * @file scripts/jsr-doc-coverage.mjs
 * @description Enumerate a package's JSR public API and report which exported
 *   symbols (and class/interface members) lack a JSDoc *description*.
 *
 *   JSR's "has docs for most symbols" score counts a symbol documented only
 *   when its doc comment has prose — a tag-only `/** @returns … *​/` or
 *   `/** @type … *​/` does NOT count. This tool surfaces exactly those gaps so
 *   they can be fixed, and doubles as a backslide guard.
 *
 *   Methodology: for each `jsr.json` entrypoint, resolve the public symbols
 *   (following barrel re-exports — `export { a } from`, `export * from`,
 *   `export * as N from`, and local `export class/function/const`), then read
 *   each symbol's doc via `deno doc --json` (which reads the generated `.d.ts`
 *   pointed at by `@ts-self-types`, the same declarations JSR scores).
 *
 *   Requires deno; silently reports nothing for packages without a jsr.json
 *   (the JSR distribution is dormant until then).
 *
 * Usage:
 *   node scripts/jsr-doc-coverage.mjs [pkgName]          # report
 *   node scripts/jsr-doc-coverage.mjs --min 80 [pkgName] # exit 1 if under 80%
 *   node scripts/jsr-doc-coverage.mjs --members [pkgName]# also list members
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** deno-doc --json cache, keyed by absolute source path. Map<name, SymbolDoc>. */
const docCache = new Map();

/**
 * Run `deno doc --json` on a source file (reading the `.d.ts` it points at) and
 * return a name → doc map for its *exported* declarations.
 *
 * @typedef {{ kind: string, hasDoc: boolean, members: { name: string, kind: string, hasDoc: boolean }[] }} SymbolDoc
 * @param {string} absPath
 * @returns {Map<string, SymbolDoc>}
 */
function docOf(absPath) {
  if (docCache.has(absPath)) return docCache.get(absPath);
  const out = new Map();
  if (!existsSync(absPath)) {
    docCache.set(absPath, out);
    return out;
  }
  let data;
  try {
    const raw = execSync(
      `deno doc --json ${JSON.stringify(absPath)} 2>/dev/null`,
      {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    data = JSON.parse(raw);
  } catch {
    docCache.set(absPath, out);
    return out;
  }
  for (const mod of Object.values(data.nodes || {})) {
    for (const sym of mod.symbols || []) {
      // A name can have several declarations (e.g. an `@enum` const emits both
      // a `typeAlias` and a `namespace`). JSR counts the symbol documented when
      // *any* declaration is documented, so OR across them and merge members.
      let hasDoc = false;
      let kind;
      const members = [];
      for (const decl of sym.declarations || []) {
        if (decl.declarationKind && decl.declarationKind !== "export") continue;
        if (hasDescription(decl.jsDoc)) hasDoc = true;
        if (kind === undefined) kind = decl.kind;
        else if (kind === "namespace" && decl.kind !== "namespace")
          kind = decl.kind;
        const def = decl.def || {};
        for (const c of def.constructors || [])
          members.push({
            name: "constructor",
            kind: "constructor",
            hasDoc: hasDescription(c.jsDoc),
          });
        for (const p of def.properties || [])
          members.push({
            name: p.name,
            kind: p.kind || "property",
            hasDoc: hasDescription(p.jsDoc),
          });
        for (const m of def.methods || [])
          members.push({
            name: m.name,
            kind: m.kind || "method",
            hasDoc: hasDescription(m.jsDoc),
          });
        for (const is of def.indexSignatures || [])
          members.push({
            name: "[index]",
            kind: "indexSignature",
            hasDoc: hasDescription(is.jsDoc),
          });
      }
      if (kind !== undefined) out.set(sym.name, { kind, hasDoc, members });
    }
  }
  docCache.set(absPath, out);
  return out;
}

/** JSR counts a symbol documented only with non-empty description prose. */
export function hasDescription(jsDoc) {
  return !!(jsDoc && String(jsDoc.doc ?? "").trim());
}

/** Resolve `./x.js` / `../x.js` against the importing file's directory. */
function resolveFrom(spec, fromFile) {
  if (!spec.startsWith(".")) return null; // bare specifier (external) — not ours
  return resolve(dirname(fromFile), spec);
}

const LOCAL_EXPORT_RE =
  /\bexport\s+(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const STAR_AS_RE =
  /\bexport\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g;
const STAR_RE = /\bexport\s+\*\s+from\s+["']([^"']+)["']/g;
const NAMED_RE = /\bexport\s+\{([^}]*?)\}\s*(?:from\s+["']([^"']+)["'])?/g;

/**
 * Pure export-specifier parser: reads a module's source and returns its
 * exports as descriptors, WITHOUT resolving `from` specifiers or pulling
 * wildcard targets (that needs the doc graph). Exported for unit testing.
 *
 * @param {string} src
 * @returns {{ kind: "local"|"named"|"star"|"star-as", name?: string, origName?: string, fromSpec?: string }[]}
 */
export function parseExports(src) {
  const out = [];
  for (const m of src.matchAll(LOCAL_EXPORT_RE))
    out.push({ kind: "local", name: m[1] });
  for (const m of src.matchAll(STAR_AS_RE))
    out.push({ kind: "star-as", name: m[1], fromSpec: m[2] });
  for (const m of src.matchAll(STAR_RE))
    out.push({ kind: "star", fromSpec: m[1] });
  for (const m of src.matchAll(NAMED_RE)) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fromSpec = m[2];
    for (const spec of names) {
      const asMatch = spec.match(
        /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/,
      );
      const publicName = asMatch
        ? asMatch[2]
        : spec.match(/^([A-Za-z_$][\w$]*)/)?.[1];
      const origName = asMatch ? asMatch[1] : publicName;
      if (publicName)
        out.push({ kind: "named", name: publicName, origName, fromSpec });
    }
  }
  return out;
}

/**
 * Parse a module's exports into a list of public refs:
 *   { name, module: absSourcePath, namespace?: boolean }
 * Barrel re-exports are resolved to their defining module.
 *
 * @param {string} file
 * @returns {{ name: string, module: string, namespace?: boolean, origName?: string }[]}
 */
function exportsOf(file) {
  const src = readFileSync(file, "utf8");
  const refs = [];
  for (const e of parseExports(src)) {
    switch (e.kind) {
      case "local":
        refs.push({ name: e.name, module: file });
        break;
      case "star-as":
        refs.push({
          name: e.name,
          module: file,
          namespace: true,
          nsSource: resolveFrom(e.fromSpec, file),
        });
        break;
      case "star": {
        const target = resolveFrom(e.fromSpec, file);
        if (target)
          for (const name of docOf(target).keys())
            refs.push({ name, module: target });
        break;
      }
      case "named": {
        const target = e.fromSpec ? resolveFrom(e.fromSpec, file) : file;
        refs.push({ name: e.name, module: target, origName: e.origName });
        break;
      }
    }
  }
  return refs;
}

/**
 * Build the de-duplicated public symbol set for a package, across all
 * `jsr.json` entrypoints.
 *
 * @param {string} pkgDir
 * @returns {{ name: string, module: string, doc: SymbolDoc | null, namespace?: boolean }[]}
 */
function publicSymbols(pkgDir) {
  const jsrPath = join(pkgDir, "jsr.json");
  if (!existsSync(jsrPath)) return [];
  const { exports = {} } = JSON.parse(readFileSync(jsrPath, "utf8"));
  const seen = new Set();
  const out = [];
  const add = (name, module, { namespace = false, origName } = {}) => {
    const key = `${module}::${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const doc = namespace ? null : docOf(module).get(origName || name) || null;
    out.push({ name, module, doc, namespace });
  };
  for (const value of Object.values(exports)) {
    if (typeof value !== "string" || !value.endsWith(".js")) continue;
    const entry = join(pkgDir, value);
    // 1. Symbols defined directly in the entrypoint module — this includes
    //    JSDoc `@typedef`/`@callback` declarations that are NOT `export`
    //    statements and so would be missed by exportsOf(). For a pure barrel
    //    this is empty.
    for (const name of docOf(entry).keys()) add(name, entry);
    // 2. Barrel re-exports (resolved to their defining module). Skip refs that
    //    point back at this module (already covered above).
    for (const r of exportsOf(entry)) {
      if (r.module === entry && !r.namespace) continue;
      add(r.name, r.module, { namespace: r.namespace, origName: r.origName });
    }
  }
  return out;
}

/**
 * @param {string} pkgName  e.g. "noflo" or "@noflo/noflo"
 * @param {{ root: string }} opts
 * @returns {{ pkg: string, topTotal: number, topDoc: number, memTotal: number, memDoc: number, gaps: any[] }}
 */
export function coverageFor(pkgName, { root }) {
  const pkgDir = resolvePkgDir(pkgName, root);
  const syms = publicSymbols(pkgDir);
  const pkg = pkgName.replace(/^@noflo\//, "");
  let topTotal = 0;
  let topDoc = 0;
  let memTotal = 0;
  let memDoc = 0;
  const gaps = [];
  for (const s of syms) {
    topTotal++;
    const documented = s.namespace ? false : !!s.doc?.hasDoc;
    if (documented) topDoc++;
    else
      gaps.push({
        pkg,
        level: "symbol",
        name: s.name,
        kind: s.doc?.kind ?? (s.namespace ? "namespace" : "?"),
        file: s.module,
      });
    if (s.doc?.members?.length) {
      for (const m of s.doc.members) {
        memTotal++;
        if (m.hasDoc) memDoc++;
        else
          gaps.push({
            pkg,
            level: "member",
            name: `${s.name}.${m.name}`,
            kind: m.kind,
            file: s.module,
          });
      }
    }
  }
  return { pkg, topTotal, topDoc, memTotal, memDoc, gaps };
}

function resolvePkgDir(pkgName, root) {
  const dir = join(root, "packages");
  const short = pkgName.replace(/^@noflo\//, "");
  const direct = join(dir, short);
  if (existsSync(join(direct, "jsr.json"))) return direct;
  // match by package name in jsr.json
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    const j = join(p, "jsr.json");
    if (existsSync(j) && JSON.parse(readFileSync(j, "utf8")).name === pkgName)
      return p;
  }
  throw new Error(`No JSR package matching "${pkgName}" under ${dir}`);
}

function pct(n, d) {
  return d === 0 ? 100 : Math.round((n / d) * 100);
}

function main() {
  const args = process.argv.slice(2);
  let min = null;
  let showMembers = false;
  let minSymbols = 5; // % is meaningless for packages with a handful of symbols
  const pkgs = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--min") min = Number(args[++i]);
    else if (a === "--min-symbols") minSymbols = Number(args[++i]);
    else if (a === "--members") showMembers = true;
    else pkgs.push(a);
  }
  const root = DEFAULT_ROOT;
  const all = pkgs.length
    ? pkgs
    : readdirSync(join(root, "packages")).filter((p) =>
        existsSync(join(root, "packages", p, "jsr.json")),
      );
  if (all.length === 0) {
    console.log(
      "No JSR packages yet (no packages/*/jsr.json) — nothing to check.",
    );
    return;
  }

  let worst = 100;
  let gatedName = null;
  for (const name of all) {
    const c = coverageFor(name, { root });
    const tp = pct(c.topDoc, c.topTotal);
    const mp = pct(c.memDoc, c.memTotal);
    // Only gate packages with enough symbols for the % to be meaningful.
    // A 2-symbol package (e.g. one that only re-exports an external type) can
    // sit at 50% for structural reasons unrelated to doc quality.
    if (min !== null && c.topTotal >= minSymbols) {
      if (tp < worst) {
        worst = tp;
        gatedName = `@noflo/${c.pkg}`;
      }
    }
    console.log(
      `\n@noflo/${c.pkg}: ${c.topDoc}/${c.topTotal} symbols documented (${tp}%)` +
        (c.memTotal ? `  |  members ${c.memDoc}/${c.memTotal} (${mp}%)` : ""),
    );
    const show = c.gaps.filter((g) => g.level === "symbol" || showMembers);
    for (const g of show) {
      const where = g.file.split(`/packages/${c.pkg}/`)[1] || g.file;
      console.log(
        `  ✗ [${g.level}] ${String(g.kind).padEnd(10)} ${g.name}  (${where})`,
      );
    }
  }
  if (min !== null && worst < min) {
    console.error(
      `\n✗ ${gatedName} symbol-doc coverage ${worst}% < required ${min}%`,
    );
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
