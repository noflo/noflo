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
// harvested by calling the module's `getComponent()`.

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
 * @param {string} baseDir
 * @returns {{ source: string|null, revision: string|null }}
 */
export function readSource(baseDir) {
  let source = null;
  let revision = null;
  const pkgPath = path.join(baseDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const url = pkg.repository?.url ?? null;
    if (url) {
      source = url.replace(/^git\+/, "").replace(/\.git$/, "");
    }
  }
  const gitDir = path.join(baseDir, ".git");
  if (fs.existsSync(gitDir)) {
    try {
      revision = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
      const match = /^ref: (.+)$/.exec(revision);
      if (match) {
        revision = fs.readFileSync(path.join(gitDir, match[1]), "utf8").trim();
      }
    } catch {
      // Not a readable git checkout
    }
  }
  return { source, revision };
}

/**
 * Derives the platform set from a component module's static imports,
 * following the migration protocol's dependency ladder: Web-standard
 * imports (or no imports beyond the framework) are browser-capable,
 * `node:` imports are server-side runtimes, and third-party imports
 * qualify for Node conservatively.
 * @param {string} modulePath
 * @returns {string[]}
 */
export function derivePlatforms(modulePath) {
  const source = fs.readFileSync(modulePath, "utf8");
  const imports = [];
  const importPattern = /import\s+(?:[\w*{},\s]+from\s+)?["']([^"']+)["']/g;
  let match = importPattern.exec(source);
  while (match) {
    imports.push(match[1]);
    match = importPattern.exec(source);
  }
  let level = 1;
  for (const specifier of imports) {
    if (specifier.startsWith("node:")) {
      level = Math.max(level, 2);
      continue;
    }
    if (specifier === "@noflo/noflo" || specifier.startsWith("@noflo/")) {
      continue;
    }
    if (specifier.startsWith(".") || specifier.startsWith("#")) {
      // Relative package-internal imports carry no additional
      // requirement at this level; a full closure analysis would walk
      // them
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
 * @returns {{ signature: ManifestSignature, description: string|null, icon: string|null, assembly: boolean }}
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
    assembly: false,
  };
}

/**
 * Detects the Assembly Line convention for an instantiated component by
 * walking its prototype chain against the Assembly base class.
 * @param {import("@noflo/noflo").Component} instance
 * @returns {boolean}
 */
/**
 * @param {any} instance
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
 * Finds the fbp-spec suite associated with a component, by the
 * basename convention (spec/<Name>.yaml).
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
  for (const ext of [".yaml", ".yml", ".json"]) {
    const candidate = path.join("spec", `${base}${ext}`);
    if (fs.existsSync(path.join(baseDir, candidate))) {
      return candidate;
    }
  }
  return null;
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
 * Statically derives a graph component's signature from its exported
 * ports, by resolving the internal components through the loader and
 * reading the exported port metadata from the wired subgraph.
 * @param {import("@noflo/graph").GraphModel} graph
 * @param {import("@noflo/noflo").ComponentLoader} loader
 * @returns {Promise<{ signature: ManifestSignature, description: string|null, icon: string|null }>}
 */
export async function deriveGraphSignature(graph, loader) {
  const manifestLoader = loader;
  manifestLoader.registerGraph("__manifest", "__graph", graph);
  const instance = await manifestLoader.load("__manifest/__graph");
  const signature = {
    inports: harvestPorts(instance.inPorts),
    outports: harvestPorts(instance.outPorts),
  };
  const graphMetadata = graph.graphMetadata?.() ?? {};
  return {
    signature,
    description: graphMetadata.description ?? instance.description ?? null,
    icon: graphMetadata.icon ?? instance.icon ?? null,
  };
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

  // Elementary components
  if (fs.existsSync(componentsDir)) {
    const moduleFiles = fs
      .readdirSync(componentsDir)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".d.ts"));
    for (const file of moduleFiles) {
      const modulePath = path.join(componentsDir, file);
      const moduleUrl = pathToFileURL(modulePath).href;
      const module = await import(moduleUrl);
      const instance = module.getComponent();
      const { signature, description, icon, assembly } = {
        ...harvestInstance(instance),
        assembly: await detectAssembly(instance),
      };
      components.push({
        name: `${identity.id}/${path.basename(file, ".js")}`,
        path: path.posix.join("components", file),
        type: "elementary",
        description,
        icon,
        signature,
        spec: findSpec(baseDir, file),
        assembly,
        platforms: derivePlatforms(modulePath),
      });
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
      );
      components.push({
        name: `${identity.id}/${path.basename(file, path.extname(file))}`,
        path: path.posix.join("graphs", file),
        type: "subgraph",
        description,
        icon,
        signature,
        spec: findSpec(baseDir, file),
        assembly: false,
        references: graphReferences(graph),
        platforms: ["node"],
      });
    }
  }

  // Namespace map: every library namespace referenced by this package's
  // graphs, resolved to the providing package via node_modules
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
    const pkgPath = path.join(
      baseDir,
      "node_modules",
      `@noflo`,
      namespace,
      "package.json",
    );
    if (fs.existsSync(pkgPath)) {
      namespaces[namespace] = {
        npm: JSON.parse(fs.readFileSync(pkgPath, "utf8")).name,
      };
    }
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
