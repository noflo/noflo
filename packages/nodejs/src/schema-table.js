//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module schema-table
 * @description Loads the runtime's schema table from installed packages
 *   (work document #37 phase 2): every dependency that ships a
 *   `noflo.json` with a schemas table contributes its digest-verified
 *   bodies to the grow-only store. This is the manifest-first rung of the
 *   WD #24 discovery ladder applied to schema bodies — the manifests are
 *   consumed as data, never as package dependencies.
 */
/* @ts-self-types="./schema-table.d.ts" */

import fs from "node:fs";
import path from "node:path";
import { SchemaTable } from "@noflo/runtime";

/**
 * Build a {@link SchemaTable} from the packages installed under a
 * project's `node_modules`: every package whose `noflo.json` carries a
 * `schemas` table is loaded, digest-verified. Packages without a schemas
 * table contribute nothing. Returns the table even when nothing loads —
 * an empty table answers all-nil, which is the legitimate no-table state.
 *
 * @param {string} baseDir Project root containing `node_modules`.
 * @returns {Promise<SchemaTable>}
 */
export async function schemaTableFromNodeModules(baseDir) {
  const table = new SchemaTable();
  // The project's own manifest first: the runtime serves its own schemas
  const self = path.join(baseDir, "noflo.json");
  if (hasSchemaTable(self)) {
    await table.loadPackage(baseDir);
  }
  for (const pkgDir of await listPackages(baseDir)) {
    if (hasSchemaTable(path.join(pkgDir, "noflo.json"))) {
      await table.loadPackage(pkgDir);
    }
  }
  return table;
}

/**
 * @param {string} manifestPath
 * @returns {boolean}
 */
function hasSchemaTable(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return false;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Boolean(
      manifest.schemas && Object.keys(manifest.schemas).length > 0,
    );
  } catch {
    // A manifest unreadable as JSON is not a schema provider
    return false;
  }
}

/**
 * Walk `node_modules` breadth-wise: direct dependencies and, for scoped
 * packages, one level deeper. Nested node_modules are not traversed —
 * npm's flat install hoists everything the runtime can see anyway.
 *
 * @param {string} baseDir
 * @returns {Promise<string[]>} Package directories, sorted.
 */
async function listPackages(baseDir) {
  const depsDir = path.resolve(baseDir, "node_modules");
  if (!fs.existsSync(depsDir)) {
    return [];
  }
  /** @type {string[]} */
  const packages = [];
  for (const entry of fs.readdirSync(depsDir).sort()) {
    if (entry.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(depsDir, entry);
    if (!entry.startsWith("@")) {
      if (fs.statSync(entryPath).isDirectory()) {
        packages.push(entryPath);
      }
      continue;
    }
    for (const scoped of fs.readdirSync(entryPath).sort()) {
      const scopedPath = path.join(entryPath, scoped);
      if (fs.statSync(scopedPath).isDirectory()) {
        packages.push(scopedPath);
      }
    }
  }
  return packages;
}
