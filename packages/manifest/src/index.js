// Publish-time component manifest generation for NoFlo libraries.
//
// Implements the manifest design from the NoFlo project's published
// manifest work document: a library-published data artifact covering
// every `components/` and `graphs/` entry, with signatures, component
// kinds, spec references, platform derivation, and self-description
// (npm/JSR/source), consumable without executing any library code.
//
// The only execution in the pipeline is the author's own code on the
// author's machine at publish time: elementary component signatures are
// harvested by calling the module's `getComponent()`, and graph
// signatures are derived from the exported ports of their wired
// components. Graph signature derivation is data-first: an export's
// port metadata is read from an in-package harvested signature, or from
// a dependency's published manifest when one ships; only when neither
// is available does the derivation fall back to loading the wired
// component.

// (c) 2021-2026 Henri Bergius
// SPDX-License-Identifier: EUPL-1.2

// (c) 2021-2026 Henri Bergius
// SPDX-License-Identifier: EUPL-1.2

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse } from "@noflo/fbp";
import { GraphModel, importFbpJson } from "@noflo/graph";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import { ComponentLoader } from "@noflo/noflo";

/**
 * @typedef {Object} ManifestPort
 * @property {string} name
 * @property {string} datatype
 * @property {boolean} addressable
 * @property {string|null} description
 * @property {boolean} required
 * @property {boolean} control
 */

/**
 * @typedef {Object} ManifestSignature
 * @property {ManifestPort[]} inports
 * @property {ManifestPort[]} outports
 */

/**
 * @typedef {Object} ManifestComponent
 * @property {string} name - Library-namespaced name, e.g. `fs/ReadFile`
 * @property {string} path - Module specifier or graph file path
 * @property {"elementary"|"subgraph"|"stub"} type
 * @property {string|null} description
 * @property {string|null} icon
 * @property {ManifestSignature} signature
 * @property {string|null} spec - Associated fbp-spec suite path
 * @property {boolean} assembly - Derives from the Assembly Line base class
 * @property {string[]} platforms - e.g. ["browser", "node", "deno", "bun"]
 * @property {string[]} [references] - Library-namespaced names a graph wires in
 */

/**
 * @typedef {Object} Manifest
 * @property {"noflo-manifest"} format
 * @property {number} version
 * @property {string} id - Library namespace id, e.g. `fs`
 * @property {string|null} description
 * @property {string|null} icon
 * @property {string} npm - Published npm package name
 * @property {string|null} jsr - Published JSR package name
 * @property {string|null} source - Git repository URL
 * @property {string|null} revision - Revision the manifest was generated from
 * @property {boolean} loader - Whether the package has a dynamic loader plugin
 * @property {Record<string, { npm: string }>} namespaces - Providing packages for referenced library namespaces
 * @property {ManifestComponent[]} components
 */

/**
 * Applies the NoFlo library naming conventions to a package name: the
 * package named exactly `noflo` maps to the empty library name, scope
 * prefixes are stripped, and a leading `noflo-` prefix is dropped.
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
 * Reads the library-level self-description from a package.json.
 * @param {string} baseDir
 * @returns {{ id: string, npm: string, description: string|null, icon: string|null, loader: boolean }}
 */
export function readLibraryIdentity(baseDir) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(baseDir, "package.json"), "utf8"),
  );
  const noflo = pkg.noflo ?? {};
  return {
    id: normalizeLibraryName(pkg.name),
    npm: pkg.name,
    description: pkg.description ?? null,
    icon: noflo.icon ?? null,
    loader: noflo.loader != null,
  };
}

/**
 * Reads the git repository URL and current revision for the package.
 * Uses `git rev-parse` so packed refs and worktree `.git` files are
 * handled; a non-git directory yields nulls.
 * @param {string} baseDir
 * @returns {{ source: string|null, revision: string|null }}
 */
export function readSource(baseDir) {
  let source = null;
  const pkgPath = path.join(baseDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const url = pkg.repository?.url ?? null;
    if (url) {
      source = url.replace(/^git\+/, "").replace(/\.git$/, "");
    }
  }
  let revision = null;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: baseDir,
      encoding: "utf8",
    }).trim();
  } catch {
    // Not a git checkout (or git unavailable); provenance stays null
    revision = null;
  }
  return { source, revision };
}

/**
 * Derives the platform set from a module's static imports, following
 * the migration protocol's dependency ladder: Web-standard imports (or
 * no imports beyond the framework) are browser-capable, `node:` imports
 * are server-side runtimes, and third-party imports qualify for Node
 * conservatively.
 *
 * Known limits, documented in the README: dynamic `import()` and
 * `export ... from` clauses are recognized, but relative imports are
 * not walked transitively, and import-looking text inside comments
 * counts as an import.
 * @param {string} modulePath
 * @returns {string[]}
 */
export function derivePlatforms(modulePath) {
  const source = fs.readFileSync(modulePath, "utf8");
  return derivePlatformsFromSource(source);
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function derivePlatformsFromSource(source) {
  /** @type {string[]} */
  const specifiers = [];
  const patterns = [
    /import\s+(?:[\w*{},\s]+from\s+)?["']([^"']+)["']/g,
    /export\s+(?:[\w*{},\s]+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }
  let level = 1;
  for (const specifier of specifiers) {
    if (specifier.startsWith("node:")) {
      level = Math.max(level, 2);
      continue;
    }
    if (specifier === "@noflo/noflo" || specifier.startsWith("@noflo/")) {
      continue;
    }
    if (specifier.startsWith(".") || specifier.startsWith("#")) {
      // Relative and package-internal imports carry no additional
      // requirement at this level; a full closure analysis would walk
      // them transitively
      continue;
    }
    level = 3;
  }
  if (level === 1) {
    return ["browser", "node", "deno", "bun"];
  }
  if (level === 2) {
    return ["node", "deno", "bun"];
  }
  return ["node"];
}

/**
 * Harvests the port field set from a NoFlo port collection.
 * @param {{ ports: Record<string, any> }} ports
 * @returns {ManifestPort[]}
 */
function harvestPorts(ports) {
  return Object.keys(ports.ports).map((name) => {
    const port = ports.ports[name];
    const options = /** @type {Record<string, any>} */ (port.options ?? {});
    return {
      name,
      datatype: options.datatype ?? "all",
      addressable: Boolean(port.isAddressable?.()),
      description: options.description ?? null,
      required: Boolean(options.required),
      control: Boolean(options.control),
    };
  });
}

/**
 * Harvests the signature and metadata from an instantiated component.
 * @param {import("@noflo/noflo").Component} instance
 * @returns {{ signature: ManifestSignature, description: string|null, icon: string|null }}
 */
export function harvestInstance(instance) {
  const signature = {
    inports: harvestPorts(instance.inPorts),
    outports: harvestPorts(instance.outPorts),
  };
  return {
    signature,
    description: instance.description ?? null,
    icon: instance.getIcon?.() ?? instance.icon ?? null,
  };
}

/**
 * Detects the Assembly Line convention for an instantiated component by
 * walking its prototype chain against the Assembly base class.
 * @param {import("@noflo/noflo").Component} instance
 * @returns {Promise<boolean>}
 */
export async function detectAssembly(instance) {
  try {
    const assembly = await import("@noflo/assembly");
    const Base = assembly.Component;
    let proto = Object.getPrototypeOf(instance);
    while (proto) {
      if (proto === Base.prototype) {
        return true;
      }
      proto = Object.getPrototypeOf(proto);
    }
    return false;
  } catch {
    // The Assembly base class is not installed; no convention detection
    return false;
  }
}

/**
 * Finds the fbp-spec suite associated with a component, searching the
 * `spec/` tree recursively by basename.
 * @param {string} baseDir
 * @param {string} componentName
 * @returns {string|null}
 */
function findSpec(baseDir, componentName) {
  const base = path.basename(componentName).replace(/\.\w+$/, "");
  const specDir = path.join(baseDir, "spec");
  if (!fs.existsSync(specDir)) {
    return null;
  }
  /** @type {string|null} */
  let found = null;
  const walk = (dir) => {
    if (found) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      const rel = path.relative(baseDir, entryPath);
      if (
        (entry.name === `${base}.yaml` ||
          entry.name === `${base}.yml` ||
          entry.name === `${base}.json`) &&
        !found
      ) {
        found = rel.split(path.sep).join("/");
      }
    }
  };
  walk(specDir);
  return found;
}

/**
 * Reads the `@name` source-comment override for a component file, when
 * present (the migration protocol's `@name Foo` comment).
 * @param {string} modulePath
 * @returns {string|null}
 */
function readNameOverride(modulePath) {
  const source = fs.readFileSync(modulePath, "utf8");
  const match = /@name\s+([A-Za-z0-9_-]+)/.exec(source);
  return match ? match[1] : null;
}

/**
 * Builds a ComponentLoader over the package's own discovery, so graph
 * exports can resolve against the package's dependencies.
 * @param {string} baseDir
 * @returns {Promise<import("@noflo/noflo").ComponentLoader>}
 */
export async function createLoader(baseDir) {
  const registry = /** @type {any} */ (
    await createNodeModulesRegistry(baseDir)
  );
  const loader = new ComponentLoader({ registry });
  await loader.listComponents();
  return loader;
}

/**
 * Candidate npm package names providing a library namespace: the scoped
 * convention first, then the unscoped legacy one (both are valid
 * providers for the loader's discovery).
 * @param {string} namespace
 * @returns {string[]}
 */
function providerPackageNames(namespace) {
  return [`@noflo/${namespace}`, `noflo-${namespace}`];
}

/**
 * Resolves the npm package providing a library namespace, by reading
 * the provider's package.json from the package's own node_modules.
 * Throws when no provider is installed, since an unresolved namespace
 * breaks data-only closure resolution.
 * @param {string} baseDir
 * @param {string} namespace
 * @returns {{ npm: string }}
 */
function resolveNamespaceProvider(baseDir, namespace) {
  for (const candidate of providerPackageNames(namespace)) {
    const pkgPath = path.join(
      baseDir,
      "node_modules",
      candidate,
      "package.json",
    );
    if (fs.existsSync(pkgPath)) {
      return { npm: JSON.parse(fs.readFileSync(pkgPath, "utf8")).name };
    }
  }
  throw new Error(
    `Manifest generation failed: the namespace '${namespace}' is referenced by this package's graphs, but no providing package (${providerPackageNames(namespace).join(" or ")}) is installed in node_modules. Install it so the namespaces map can resolve the closure.`,
  );
}

/**
 * Derives a graph component's signature from its exported ports. The
 * derivation is data-first: an export's port metadata is read from the
 * in-package harvested signature of the wired component, or from the
 * wired component's published manifest when its package ships one. Only
 * when neither source has the wired component does the derivation fall
 * back to resolving it through the loader (the one executing step).
 * @param {import("@noflo/graph").GraphModel} graph
 * @param {import("@noflo/noflo").ComponentLoader} loader
 * @param {Map<string, ManifestComponent>} harvestedByName
 * @param {string} baseDir
 * @returns {Promise<{ signature: ManifestSignature, description: string|null, icon: string|null }>}
 */
export async function deriveGraphSignature(
  graph,
  loader,
  harvestedByName,
  baseDir,
) {
  const graphMetadata = graph.graphMetadata?.() ?? {};
  /** @type {ManifestPort[]} */
  const inports = [];
  /** @type {ManifestPort[]} */
  const outports = [];
  /** @type {boolean} */
  let needsFallback = false;
  for (const exp of graph.exports()) {
    const internal = `${exp.internal.node}/${exp.internal.port}`;
    const harvested = harvestedByName.get(exp.internal.node);
    const entry = harvested ?? manifestSignatureFor(baseDir, exp.internal.node);
    if (!entry) {
      needsFallback = true;
      break;
    }
    const signature =
      "type" in entry &&
      (entry.type === "elementary" || entry.type === "subgraph")
        ? entry.signature
        : /** @type {ManifestSignature} */ (/** @type {unknown} */ (entry));
    const all = [...signature.inports, ...signature.outports];
    const port = all.find((p) => p.name === exp.internal.port);
    if (!port) {
      throw new Error(
        `Graph export '${exp.public}' targets '${internal}', but the wired component declares no such port`,
      );
    }
    const manifestPort = { ...port, name: exp.public };
    if (exp.direction === "inport") {
      inports.push(manifestPort);
    } else {
      outports.push(manifestPort);
    }
  }
  /**
   * Resolves a library-namespaced reference to the harvested in-package
   * entry, matching on the full name or the bare component name.
   * @param {string} reference
   * @returns {ManifestComponent|undefined}
   */
  const harvestedForReference = (reference) => {
    if (harvestedByName.has(reference)) {
      return harvestedByName.get(reference);
    }
    const bare = reference.split("/").pop() ?? "";
    return harvestedByName.get(bare);
  };
  if (needsFallback) {
    // The wired component is neither harvested in-package nor manifest-
    // published: resolve it through the loader (executes its code)
    loader.registerGraph("__manifest", "__graph", graph);
    let instance;
    try {
      instance = await loader.load("__manifest/__graph");
    } catch (error) {
      const unresolvable = graph
        .nodes()
        .map((node) => node.component)
        .filter(
          (name) =>
            !harvestedForReference(name) &&
            !manifestSignatureFor(baseDir, name),
        );
      const namespaces = new Set(
        unresolvable.map((name) => name.split("/")[0]),
      );
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Graph wires components that cannot be resolved: ${unresolvable.join(", ")}. No in-package signature, no published manifest, and not loadable (\`${detail}\`). Namespaces without an installed provider: ${[...namespaces].join(", ") || "none"}. Install the providing packages (npm:@noflo/<namespace> or noflo-<namespace>) before generating the manifest.`,
      );
    }
    return {
      signature: {
        inports: harvestPorts(instance.inPorts),
        outports: harvestPorts(instance.outPorts),
      },
      description: graphMetadata.description ?? instance.description ?? null,
      icon: graphMetadata.icon ?? instance.icon ?? null,
    };
  }
  return {
    signature: { inports, outports },
    description: graphMetadata.description ?? null,
    icon: graphMetadata.icon ?? null,
  };
}

/**
 * Reads a component's manifest entry from a dependency's published
 * manifest, when the dependency ships one.
 * @param {string} baseDir
 * @param {string} namespacedName
 * @returns {ManifestComponent|null}
 */
function manifestSignatureFor(baseDir, namespacedName) {
  const namespace = namespacedName.split("/")[0];
  if (!namespace) {
    return null;
  }
  for (const candidate of providerPackageNames(namespace)) {
    const manifestPath = path.join(
      baseDir,
      "node_modules",
      candidate,
      "noflo.json",
    );
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return (
      manifest.components?.find(
        (/** @type {any} */ c) => c.name === namespacedName,
      ) ?? null
    );
  }
  return null;
}

/**
 * Lists the library-namespaced component names a graph wires in.
 * @param {import("@noflo/graph").GraphModel} graph
 * @returns {string[]}
 */
export function graphReferences(graph) {
  const names = new Set();
  for (const node of graph.nodes()) {
    if (node.component) {
      names.add(node.component);
    }
  }
  return [...names];
}

/**
 * Intersects platform sets; an empty intersection (or an empty input)
 * falls back to node-only, since something must provide the runtime.
 * @param {string[][]} sets
 * @returns {string[]}
 */
function intersectPlatforms(sets) {
  if (!sets.length) {
    return ["node"];
  }
  const intersection = sets.reduce((acc, set) =>
    acc.filter((p) => set.includes(p)),
  );
  return intersection.length ? intersection : ["node"];
}

/**
 * Generates the manifest for a NoFlo component library.
 * @param {string} baseDir - Package root of the library
 * @param {{ revision?: string|null }} [options]
 * @returns {Promise<Manifest>}
 */
export async function generateManifest(baseDir, options = {}) {
  const identity = readLibraryIdentity(baseDir);
  const { source, revision: gitRevision } = readSource(baseDir);
  const componentsDir = path.join(baseDir, "components");
  const graphsDir = path.join(baseDir, "graphs");

  const loader = await createLoader(baseDir);
  /** @type {ManifestComponent[]} */
  const components = [];
  /** @type {Map<string, ManifestComponent>} */
  const harvestedByName = new Map();

  // Elementary components
  if (fs.existsSync(componentsDir)) {
    const moduleFiles = fs
      .readdirSync(componentsDir)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".d.ts"));
    for (const file of moduleFiles) {
      const modulePath = path.join(componentsDir, file);
      const nameOverride = readNameOverride(modulePath);
      const componentName = nameOverride ?? path.basename(file, ".js");
      const moduleUrl = pathToFileURL(modulePath).href;
      let instance;
      try {
        const module = await import(moduleUrl);
        instance = module.getComponent();
      } catch (error) {
        throw new Error(
          `Failed to load component '${file}' while harvesting its signature: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const { signature, description, icon } = harvestInstance(instance);
      const assembly = await detectAssembly(instance);
      const entry = {
        name: identity.id ? `${identity.id}/${componentName}` : componentName,
        path: path.posix.join("components", file),
        type: /** @type {"elementary"} */ ("elementary"),
        description,
        icon,
        signature,
        spec: findSpec(baseDir, componentName),
        assembly,
        platforms: derivePlatforms(modulePath),
      };
      components.push(entry);
      harvestedByName.set(componentName, entry);
    }
  }

  // Graph components
  if (fs.existsSync(graphsDir)) {
    const graphFiles = fs
      .readdirSync(graphsDir)
      .filter((file) => file.endsWith(".fbp") || file.endsWith(".json"));
    for (const file of graphFiles) {
      const graphPath = path.join(graphsDir, file);
      const source = fs.readFileSync(graphPath, "utf8");
      const graphJson = file.endsWith(".fbp")
        ? parse(source)
        : JSON.parse(source);
      const graph =
        graphJson instanceof GraphModel ? graphJson : importFbpJson(graphJson);
      const { signature, description, icon } = await deriveGraphSignature(
        graph,
        loader,
        harvestedByName,
        baseDir,
      );
      const references = graphReferences(graph);
      // A graph runs wherever all of its wired components run. In-package
      // platforms are already harvested; cross-package ones come from the
      // dependency's published manifest when it ships one, and default
      // to node-only otherwise.
      const platforms = intersectPlatforms(
        references.map((reference) => {
          const inPackage = harvestedByName.get(
            reference.split("/").pop() ?? "",
          );
          if (inPackage) {
            return inPackage.platforms;
          }
          const fromManifest = manifestSignatureFor(baseDir, reference);
          return fromManifest?.platforms ?? ["node"];
        }),
      );
      components.push({
        name: identity.id
          ? `${identity.id}/${path.basename(file, path.extname(file))}`
          : path.basename(file, path.extname(file)),
        path: path.posix.join("graphs", file),
        type: "subgraph",
        description,
        icon,
        signature,
        spec: findSpec(baseDir, path.basename(file, path.extname(file))),
        assembly: false,
        references,
        platforms,
      });
    }
  }

  // Namespace map: every library namespace referenced by this package's
  // graphs, resolved to the providing package. Unresolved namespaces are
  // a hard failure: closure resolution from data is the point of the map.
  /** @type {Record<string, { npm: string }>} */
  const namespaces = {};
  const namespaceNames = new Set();
  for (const component of components) {
    for (const reference of component.references ?? []) {
      const namespace = reference.split("/")[0];
      if (namespace && namespace !== identity.id) {
        namespaceNames.add(namespace);
      }
    }
  }
  for (const namespace of namespaceNames) {
    namespaces[namespace] = resolveNamespaceProvider(baseDir, namespace);
  }

  return {
    format: "noflo-manifest",
    version: 1,
    id: identity.id,
    description: identity.description,
    icon: identity.icon,
    npm: identity.npm,
    jsr: null,
    source,
    revision: options.revision ?? gitRevision,
    loader: identity.loader,
    namespaces,
    components,
  };
}
