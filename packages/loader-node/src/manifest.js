/* @ts-self-types="./manifest.d.ts" */

//     @noflo/loader-node - Node.js component discovery for NoFlo
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: EUPL-1.2

// Local node_modules discovery for NoFlo components, replacing the
// fbp-manifest dependency (work document #24). Walks a project
// directory and its node_modules dependencies, discovering components
// and graphs from package directories and collecting fbp-spec test
// paths. Produces the same module entries the `fbp.json` v1 manifest
// cache has always stored, so `registerModules` and existing cache
// files keep working.

import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const readFile = promisify(fs.readFile);

/**
 * Runtime names the noflo discovery recognizes. Sources annotating
 * other runtimes are ignored (work document #24: no other runtimes).
 *
 * @type {string[]}
 */
const supportedRuntimes = ["noflo", "noflo-nodejs", "noflo-browser"];

/**
 * File extensions scanned as potential component sources.
 *
 * @type {string[]}
 */
const componentExtensions = [".coffee", ".ts", ".js", ".litcoffee"];

/**
 * File extensions scanned as potential graph definitions.
 *
 * @type {string[]}
 */
const graphExtensions = [".json", ".fbp"];

/**
 * File extensions scanned as potential fbp-spec test files.
 *
 * @type {string[]}
 */
const specExtensions = [".coffee", ".ts", ".js", ".yaml", ".yml"];

/**
 * Derive a component or spec name from its source text: the `@name`
 * annotation when present, otherwise the file basename without
 * extension.
 *
 * @param {string} source
 * @param {string} filepath
 * @returns {string}
 */
function parseId(source, filepath) {
  const id = source.match(/@name ([A-Za-z0-9]+)/);
  if (id) {
    return id[1];
  }
  return path.basename(filepath, path.extname(filepath));
}

/**
 * Derive a runtime name from source text: the `@runtime` annotation
 * when present, otherwise null.
 *
 * @param {string} source
 * @returns {string|null}
 */
function parsePlatform(source) {
  const runtimeType = source.match(/@runtime ([a-z-]+)/);
  if (runtimeType) {
    return runtimeType[1];
  }
  return null;
}

/**
 * A discovered component entry, as stored in manifest modules.
 *
 * @typedef {Object} ManifestComponent
 * @property {string} name
 * @property {string} path - Component file path, relative to the discovery root
 * @property {string} [tests] - fbp-spec test file path, relative to the discovery root
 * @property {"stub"} [type] - Declared component kind (work documents #19
 *   and #24): signature sidecar files (`components/<name>.json`) register
 *   as stubs — a declared signature with no implementation. Entries
 *   without the field are implementation sources or graphs, as before
 */
/**
 * A discovered module entry, as stored in the `fbp.json` v1 manifest.
 *
 * @typedef {Object} ManifestModule
 * @property {string} name
 * @property {string|null} description
 * @property {string} runtime
 * @property {string} base - Module directory path, relative to the discovery root
 * @property {string} [icon]
 * @property {Object<string, any>} [noflo]
 * @property {ManifestComponent[]} components
 */
/**
 * Read package metadata for a module directory: name (with the noflo
 * library naming conventions applied by the caller), description,
 * icon, and custom loader path.
 *
 * Packages without a readable `package.json` are not packages and are
 * skipped rather than faked from the directory name (work document #24
 * divergence from fbp-manifest). Malformed package.json content fails
 * discovery.
 *
 * @param {string} baseDir
 * @returns {Promise<{name: string, description: string|null, icon: string|undefined, noflo: Object<string, any>|undefined}|null>}
 */
async function getModuleInfo(baseDir) {
  const packageFile = path.resolve(baseDir, "package.json");
  let contents;
  try {
    contents = await readFile(packageFile, "utf-8");
  } catch (err) {
    if (/** @type {any} */ (err).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  const packageData = JSON.parse(contents);
  const name = packageData.name;
  if (!name) {
    // A package manifest without a name does not identify a library
    return null;
  }
  /** @type {Object<string, any>|undefined} */
  let noflo;
  if (packageData.noflo?.loader) {
    noflo = {
      loader: packageData.noflo.loader,
    };
  }
  return {
    name,
    description: packageData.description ?? null,
    icon: packageData.noflo?.icon,
    noflo,
  };
}

/**
 * Apply the NoFlo library naming conventions to a package name: the
 * package named exactly `noflo` maps to the empty library name, scope
 * prefixes are stripped, and a leading `noflo-` prefix is dropped.
 *
 * @param {string} name
 * @returns {string}
 */
/**
 * Apply the NoFlo library naming conventions to a package name: the
 * package named exactly `noflo` maps to the empty library name, scope
 * prefixes are stripped, and a leading `noflo-` prefix is dropped.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeLibraryName(name) {
  if (name === "noflo") {
    return "";
  }
  return name.replace(/^@[a-z-]+\//, "").replace(/^noflo-/, "");
}

/**
 * Resolve the noflo runtime for a discovered source: annotated or
 * graph-declared runtime names are kept when supported, everything
 * else defaults to noflo. Returns null for unsupported runtimes,
 * which the caller drops.
 *
 * @param {string|null} runtime
 * @returns {string|null}
 */
function resolveRuntime(runtime) {
  if (runtime === null || runtime === "all") {
    // Default to NoFlo on any platform
    return "noflo";
  }
  if (!supportedRuntimes.includes(runtime)) {
    return null;
  }
  return runtime;
}

/**
 * Read a potential signature sidecar: a `components/<name>.json` file
 * carrying the declared component signature noflo-ui materializes for
 * every registry entry (work documents #19 and #24). The sidecar shape is
 * `{ name, description, icon, inports: […], outports: […] }` with
 * `{ name, type, addressable }` port entries — a subset of the manifest
 * port field set, mapped losslessly onto a StubComponent at load.
 *
 * Classification is by shape: a parseable JSON object whose `inports` and
 * `outports` are both arrays is a sidecar; anything else is not a
 * component and stays undiscovered, exactly as before sidecars existed
 * (stray JSON in a components directory keeps today's ignore behavior).
 * Port-level validation is the StubComponent constructor's job, so a
 * malformed sidecar fails loudly at load, named with the component.
 *
 * @param {string} source - File contents
 * @returns {Object<string, any>|null} The sidecar signature, or null when the file is not one
 */
function parseSidecar(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (_err) {
    // Not classifiable JSON: not a sidecar (and not a graph either —
    // unparseable files are skipped, as the graph path does)
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  if (!Array.isArray(parsed.inports) || !Array.isArray(parsed.outports)) {
    return null;
  }
  return parsed;
}

/**
 * List component sources in a directory tree. Component names come
 * from the `@name` source annotation, falling back to the filename.
 * Subdirectories are traversed recursively.
 *
 * Signature sidecars (`components/<name>.json`) are discovered as stub
 * entries. When an implementation source exists for the same name, the
 * implementation wins and the sidecar is dropped — it documents the
 * declared signature, it is not a second component (work document #24
 * update #2); when the implementation arrives later, the entry graduates.
 *
 * @param {string} componentDir
 * @param {string} root - Discovery root for relative paths
 * @returns {Promise<Array<ManifestComponent & {runtime: string}>>}
 */
async function listComponents(componentDir, root) {
  return listComponentsRecursive(componentDir, root);
}

/**
 * Recursive walker behind {@link listComponents}: collects implementation
 * sources and signature sidecars separately at every level, so the
 * implementation-wins dedupe runs over the whole subtree before the flat
 * list is returned.
 *
 * @param {string} componentDir
 * @param {string} root - Discovery root for relative paths
 * @returns {Promise<Array<ManifestComponent & {runtime: string}>>}
 */
async function listComponentsRecursive(componentDir, root) {
  let entries;
  try {
    entries = await fs.promises.readdir(componentDir);
  } catch (err) {
    if (/** @type {any} */ (err).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const potentialComponents = entries.filter((c) =>
    componentExtensions.includes(path.extname(c)),
  );
  const potentialSidecars = entries.filter(
    (c) => path.extname(c) === ".json" && !c.includes(".d.ts"),
  );
  /** @type {Array<ManifestComponent & {runtime: string}>} */
  const components = [];
  /** @type {Array<ManifestComponent & {runtime: string}>} */
  const sidecars = [];
  /** @type {string[]} */
  const subdirs = [];
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.includes(".d.ts")) {
        // Declaration files are not component sources
        return;
      }
      const entryPath = path.resolve(componentDir, entry);
      const stats = await fs.promises.stat(entryPath);
      if (!potentialComponents.includes(entry)) {
        if (potentialSidecars.includes(entry) && stats.isFile()) {
          const source = await readFile(entryPath, "utf-8");
          const sidecar = parseSidecar(source);
          if (sidecar) {
            sidecars.push({
              name:
                typeof sidecar.name === "string" && sidecar.name
                  ? sidecar.name
                  : path.basename(entryPath, ".json"),
              path: path.relative(root, entryPath),
              runtime: "noflo",
              type: "stub",
            });
          }
          return;
        }
        if (stats.isDirectory()) {
          subdirs.push(entry);
        }
        return;
      }
      if (!stats.isFile()) {
        return;
      }
      const source = await readFile(entryPath, "utf-8");
      const runtime = resolveRuntime(parsePlatform(source));
      if (runtime === null) {
        return;
      }
      components.push({
        name: parseId(source, entryPath),
        path: path.relative(root, entryPath),
        runtime,
      });
    }),
  );
  for (const dir of subdirs.sort()) {
    // eslint-disable-next-line no-await-in-loop
    const nested = await listComponentsRecursive(
      path.resolve(componentDir, dir),
      root,
    );
    components.push(...nested);
  }
  // Implementation wins: a name discovered both as a source and as a
  // sidecar keeps the source; the sidecar is documentation of the
  // declared signature (work document #24 update #2). Filtering the
  // merged list at every level resolves collisions across sibling
  // subdirectories too
  const sourceNames = new Set(
    components.filter((c) => c.type !== "stub").map((c) => c.name),
  );
  return components.concat(
    sidecars.filter((sidecar) => !sourceNames.has(sidecar.name)),
  );
}

/**
 * List graph definitions in a directory. Graph names come from the
 * `properties.id` field of FBP JSON graphs, the `@name` annotation of
 * FBP DSL graphs, or the filename. Graphs marked as `main` are
 * excluded.
 *
 * @param {string} graphsDir
 * @param {string} root - Discovery root for relative paths
 * @returns {Promise<Array<ManifestComponent & {runtime: string}>>}
 */
async function listGraphs(graphsDir, root) {
  let entries;
  try {
    entries = await fs.promises.readdir(graphsDir);
  } catch (err) {
    if (/** @type {any} */ (err).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const potentialGraphs = entries.filter((c) =>
    graphExtensions.includes(path.extname(c)),
  );
  /** @type {Array<ManifestComponent & {runtime: string}>} */
  const graphs = [];
  await Promise.all(
    potentialGraphs.map(async (entry) => {
      const graphPath = path.resolve(graphsDir, entry);
      const stats = await fs.promises.stat(graphPath);
      if (!stats.isFile()) {
        return;
      }
      const source = await readFile(graphPath, "utf-8");
      /** @type {ManifestComponent & {runtime: string}} */
      const graph = {
        name: "",
        path: path.relative(root, graphPath),
        runtime: "noflo",
      };
      if (path.extname(graphPath) === ".fbp") {
        graph.name = parseId(source, graphPath);
        graph.runtime = resolveRuntime(parsePlatform(source)) ?? "";
      } else {
        const definition = JSON.parse(source);
        const properties = definition.properties ?? {};
        graph.name = properties.id ?? parseId(source, graphPath);
        const environment = properties.environment ?? {};
        const runtime = environment.type ?? environment;
        graph.runtime =
          typeof runtime === "string"
            ? (resolveRuntime(runtime) ?? "")
            : "noflo";
        if (properties.main) {
          // Main graphs are the graph being discovered for, not a
          // reusable component of the module
          return;
        }
      }
      if (!graph.runtime) {
        return;
      }
      graphs.push(graph);
    }),
  );
  return graphs;
}

/**
 * Associate fbp-spec test files in a spec directory with the module's
 * components by name. fbp-spec YAML files take precedence over other
 * spec formats sharing a component name.
 *
 * @param {string} specDir
 * @param {ManifestModule} module
 * @param {string} root - Discovery root for relative paths
 * @returns {Promise<ManifestModule>}
 */
async function listSpecs(specDir, module, root) {
  let entries;
  try {
    entries = await fs.promises.readdir(specDir);
  } catch (err) {
    if (/** @type {any} */ (err).code === "ENOENT") {
      return module;
    }
    throw err;
  }
  /** @type {Object<string, {ext: string, specPath: string}>} */
  const specs = {};
  await Promise.all(
    entries
      .filter((c) => specExtensions.includes(path.extname(c)))
      .map(async (entry) => {
        const specPath = path.resolve(specDir, entry);
        const stats = await fs.promises.stat(specPath);
        if (!stats.isFile()) {
          return;
        }
        const source = await readFile(specPath, "utf-8");
        const specName = parseId(source, specPath);
        const ext = path.extname(specPath);
        if (specs[specName] && specs[specName].ext === ".yaml") {
          // Prefer fbp-spec files
          return;
        }
        specs[specName] = {
          ext,
          specPath: path.relative(root, specPath),
        };
      }),
  );
  return {
    ...module,
    components: module.components.map((c) => {
      const spec = specs[c.name];
      if (!spec) {
        return c;
      }
      return {
        ...c,
        tests: spec.specPath,
      };
    }),
  };
}

/**
 * Discover the manifest modules provided by a single package
 * directory. Components and graphs are grouped into one module entry
 * per runtime; a package providing only a custom loader registers as
 * a noflo module without components.
 *
 * @param {string} baseDir
 * @param {string} root - Discovery root for relative paths
 * @returns {Promise<ManifestModule[]>}
 */
async function listModule(baseDir, root) {
  const info = await getModuleInfo(baseDir);
  if (!info) {
    return [];
  }
  const [components, graphs] = await Promise.all([
    listComponents(path.resolve(baseDir, "components"), root),
    listGraphs(path.resolve(baseDir, "graphs"), root),
  ]);

  /**
   * @type {Object<string, ManifestComponent[]>}
   */
  const runtimes = {};
  for (const entry of [...components, ...graphs]) {
    const { runtime, ...component } = entry;
    if (!runtimes[runtime]) {
      runtimes[runtime] = [];
    }
    runtimes[runtime].push(component);
  }

  /**
   * @type {ManifestModule[]}
   */
  const modules = [];
  for (const [runtime, entries] of Object.entries(runtimes)) {
    modules.push({
      name: normalizeLibraryName(info.name),
      description: info.description,
      runtime,
      noflo: info.noflo,
      base: path.relative(root, baseDir),
      icon: info.icon,
      components: entries,
    });
  }
  if (modules.length === 0 && info.noflo?.loader) {
    // A package providing only a custom loader still registers
    modules.push({
      name: normalizeLibraryName(info.name),
      description: info.description,
      runtime: "noflo",
      noflo: info.noflo,
      base: path.relative(root, baseDir),
      icon: info.icon,
      components: [],
    });
  }
  return Promise.all(
    modules.map((module) =>
      listSpecs(path.resolve(baseDir, "spec"), module, root),
    ),
  );
}

/**
 * List the package directories of a project's direct dependencies:
 * the entries of `node_modules`, with `@scope` directories resolved
 * one level deeper. Dotfile entries are skipped. Missing
 * `node_modules` directories yield no dependencies.
 *
 * @param {string} baseDir
 * @returns {Promise<string[]>}
 */
async function listDependencies(baseDir) {
  const depsDir = path.resolve(baseDir, "node_modules");
  let deps;
  try {
    deps = await fs.promises.readdir(depsDir);
  } catch (err) {
    if (/** @type {any} */ (err).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  /** @type {string[]} */
  const depPaths = [];
  for (const dep of deps.sort()) {
    if (dep.startsWith(".")) {
      continue;
    }
    const depPath = path.resolve(depsDir, dep);
    if (!dep.startsWith("@")) {
      depPaths.push(depPath);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const scopes = await fs.promises.readdir(depPath);
    for (const scoped of scopes.sort()) {
      depPaths.push(path.resolve(depPath, scoped));
    }
  }
  return depPaths;
}

/**
 * Discover manifest modules for a project and its dependencies,
 * traversing `node_modules` recursively.
 *
 * @param {string} baseDir - Project base directory, and the root all
 *   discovered paths are relative to
 * @returns {Promise<ManifestModule[]>}
 */
export async function discoverModules(baseDir) {
  const root = baseDir;
  /**
   * @param {string} dir
   * @returns {Promise<ManifestModule[]>}
   */
  const walk = async (dir) => {
    const modules = await listModule(dir, root);
    const depPaths = await listDependencies(dir);
    for (const depPath of depPaths) {
      // eslint-disable-next-line no-await-in-loop
      const depModules = await walk(depPath);
      modules.push(...depModules);
    }
    return modules;
  };
  return walk(baseDir);
}
