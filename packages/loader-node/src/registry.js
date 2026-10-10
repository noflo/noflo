/* @ts-self-types="./registry.d.ts" */

//     @noflo/loader-node - Node.js component discovery for NoFlo
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2020 Flowhub UG
//     SPDX-License-Identifier: EUPL-1.2

/* eslint-disable
    import/no-dynamic-require,
    no-underscore-dangle,
*/

import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { exportFbpJson, GraphModel } from "@noflo/graph";
import { loadGraphFile } from "./graphFile.js";
import { discoverModules } from "./manifest.js";
import * as utils from "./utils.js";

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// Serializes module evaluation (source compilation and dynamic imports)
// across concurrent component registrations. Under Deno, a synchronous
// require() of an ESM module happening while other dynamic imports are
// still in flight can deadlock the module loader, so evaluations are
// queued instead of run in parallel.
let evaluationChain = Promise.resolve();

/**
 * Run an async module-evaluation task, serialized against other
 * evaluations.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function serializeEvaluation(task) {
  const run = evaluationChain.then(task, task);
  evaluationChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Try loading the TypeScript compiler. When available, TypeScript
// component sources are transpiled for setSource and for discovered .ts
// components. Loading is lazy and awaited, so runtimes with different
// module-resolution timing (Deno, Bun) behave like Node.
/** @type {Promise<any>|undefined} */
let typescriptPromise;
/** @type {any} Resolved compiler, set once the load settles */
let typescript;

/**
 * @returns {Promise<any>} The TypeScript compiler, or undefined when no
 *   compiler is installed
 */
function loadTypescript() {
  if (!typescriptPromise) {
    typescriptPromise = import("typescript")
      .then((compiler) => {
        // CJS interop shapes vary across runtimes: Node exposes the
        // compiler as the default export, Bun may expose named members
        // directly
        const mod = /** @type {any} */ (compiler);
        typescript = mod.default?.transpile ? mod.default : mod;
        return typescript;
      })
      .catch((_e) => {
        // If there is no TypeScript compiler installed, we simply don't support compiling
        return undefined;
      });
  }
  return typescriptPromise;
}

/**
 * @typedef {import("@noflo/noflo").Component} Component
 */
/**
 * A factory function creating a component instance from node metadata.
 *
 * @typedef {(metadata?: Object<string, any>) => Component} ComponentFactory
 */
/**
 * Component definition values stored in the registry. Platform-neutral:
 * factory functions, ESM module objects with `getComponent`, or live
 * `GraphModel` instances.
 *
 * @typedef {ComponentFactory | { getComponent: ComponentFactory } | GraphModel} ComponentImplementation
 */
/**
 * @typedef {Object} ComponentSources
 * @property {string} name
 * @property {string} library
 * @property {string} code
 * @property {string} language
 * @property {string} [tests]
 */
/**
 * @typedef {Object} NodeModulesRegistryOptions
 * @property {boolean} [cache] - Read component catalog from the `fbp.json` manifest cache, writing it when missing
 * @property {boolean} [discover] - Whether missing cache may trigger full node_modules discovery (default true)
 * @property {string} [manifest] - Manifest file name (default `fbp.json`)
 */

/**
 * @param {string} packageId
 * @param {string} name
 * @param {string} source
 * @param {string} language
 * @returns {Promise<string>}
 */
async function transpileSource(packageId, name, source, language) {
  switch (language) {
    case "typescript": {
      const typescript = await loadTypescript();
      if (!typescript) {
        throw new Error(
          `Unsupported component source language ${language} for ${packageId}/${name}: no TypeScript compiler installed`,
        );
      }
      try {
        return typescript.transpile(source, {
          module: typescript.ModuleKind.CommonJS,
          target: typescript.ScriptTarget.ES2020,
        });
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
    case "es6":
    case "es2015":
    case "js":
    case "javascript": {
      return source;
    }
    default: {
      throw new Error(
        `Unsupported component source language ${language} for ${packageId}/${name}`,
      );
    }
  }
}

/**
 * Evaluate a component source string in the directory context of the
 * project, returning the module implementation.
 *
 * @param {string} baseDir
 * @param {string} packageId
 * @param {string} name
 * @param {string} source
 * @returns {Promise<Object|Function>}
 */
async function evaluateModule(baseDir, packageId, name, source) {
  const { Module } = await import("node:module");
  const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
  // Use the Node.js module API to evaluate in the correct directory context
  const extension = source.indexOf("require(") !== -1 ? ".cjs" : ".js";
  const modulePath = path.resolve(baseDir, `./components/${name}${extension}`);
  // Materialize the source before evaluation: Node compiles the string
  // argument, the Deno compat layer imports the file for ESM sources,
  // and Bun resolves require(esm) against the file path, so the file
  // must exist at the module path
  mkdirSync(path.dirname(modulePath), { recursive: true });
  writeFileSync(modulePath, source, "utf-8");

  /** @type {any} */
  let implementation;
  // @ts-expect-error — Bun global only exists under the Bun runtime
  if (typeof Bun !== "undefined") {
    // Bun: Module._compile evaluates ESM lazily; require(esm) is eager
    // and native
    const { createRequire } = await import("node:module");
    implementation = createRequire(modulePath)(modulePath);
  } else {
    const moduleImpl = new Module(modulePath);
    // @ts-expect-error
    moduleImpl.paths = Module._nodeModulePaths(path.dirname(modulePath));
    moduleImpl.filename = modulePath;
    // @ts-expect-error
    moduleImpl._compile(source, modulePath);
    implementation = moduleImpl.exports;
  }
  // The evaluation has happened; remove the materialized file so source
  // storage leaves no residue in the project's components directory
  rmSync(modulePath, { force: true });
  if (
    typeof implementation !== "function" &&
    typeof implementation.getComponent !== "function"
  ) {
    throw new Error(
      `Provided source for ${packageId}/${name} failed to create a runnable component`,
    );
  }
  return implementation;
}

/**
 * Import a component module file, returning the component definition
 * (a module object with `getComponent`, or a factory function). The
 * definition is instantiated per `load()` call by the consumer, so
 * multiple loads yield independent instances.
 *
 * @param {string} componentPath
 * @returns {Promise<Object|Function>} Component definition
 */
async function importDefinition(componentPath) {
  const implementation = await serializeEvaluation(() => import(componentPath));
  let definition = implementation;
  if (
    typeof definition.getComponent !== "function" &&
    typeof definition !== "function"
  ) {
    if (
      implementation.default &&
      (typeof implementation.default.getComponent === "function" ||
        typeof implementation.default === "function")
    ) {
      // CommonJS module interop
      definition = implementation.default;
    }
  }
  if (
    typeof definition.getComponent !== "function" &&
    typeof definition !== "function"
  ) {
    throw new Error(`Unable to load ${componentPath}`);
  }
  return definition;
}

/**
 * Component registry backed by node_modules and file-system discovery
 * (work document #16). Implements the `ComponentRegistry` contract:
 *
 * - `list()` is a synchronous read of the ready catalog
 * - `get(name)` resolves implementations (kept async so the contract
 *   also covers lazy registries like browser ESM-URL maps)
 * - `setSource` stores, transpiles, and evaluates component sources,
 *   dispatching a `change` event on success
 * - `getSource` returns stored source metadata, including fbp-spec
 *   test files where discovered
 *
 * The registry is an `EventTarget`. Backed-by-live-systems events:
 * `change` (`detail: { name }`) after `setSource`, and `invalidate`
 * when the whole catalog needs re-reading.
 *
 * Discovered graph files register as pre-parsed `GraphModel` instances,
 * so neither the NoFlo core loader nor the subgraph component ever
 * touches files or DSL text.
 *
 * @extends EventTarget
 */
export class NodeModulesRegistry extends EventTarget {
  /**
   * @param {string} baseDir - Project base directory for discovery
   * @param {NodeModulesRegistryOptions} [options]
   */
  constructor(baseDir, options = {}) {
    super();
    this.baseDir = baseDir;
    this.options = options;
    /** @type {Object<string, ComponentImplementation>} */
    this.components = {};
    /** @type {Object<string, { language: string, source: string }>} */
    this.sourcesForComponents = {};
    /** @type {Object<string, string>} */
    this.specsForComponents = {};
    /** @type {Object<string, string>} */
    this.libraryIcons = {};
  }

  // ### Discovery

  /**
   * Discover and load components from the project and its node_modules
   * dependencies. Resolves when the registry is ready to hand off.
   *
   * @returns {Promise<void>}
   */
  async discover() {
    // Settle the TypeScript compiler load before discovery so
    // getLanguages() is accurate and .ts components transpile
    await loadTypescript();
    /** @type {Array<any>} */
    let modules;
    if (this.options.cache) {
      modules = await this.listComponentsFromCache();
    } else {
      modules = await discoverModules(this.baseDir);
    }
    await this.registerModules(modules);
  }

  /**
   * Load the component catalog from the `fbp.json` manifest cache,
   * discovering and writing it when missing.
   *
   * @returns {Promise<Array<any>>}
   */
  async listComponentsFromCache() {
    const manifestName = this.options.manifest || "fbp.json";
    try {
      const contents = await readFile(
        path.resolve(this.baseDir, manifestName),
        "utf-8",
      );
      return JSON.parse(contents).modules;
    } catch (err) {
      if (!this.options.discover) {
        throw err;
      }
      const modules = await discoverModules(this.baseDir);
      const filePath = path.resolve(this.baseDir, manifestName);
      const manifestContents = {
        version: 1,
        modules,
      };
      await writeFile(filePath, JSON.stringify(manifestContents, null, 2), {
        encoding: "utf-8",
      });
      return modules;
    }
  }

  /**
   * Register all components and graphs from discovered manifest modules.
   * Component files are loaded eagerly so the registry is ready at
   * handoff: `list()` entries are usable implementations.
   *
   * @param {Array<any>} modules
   * @returns {Promise<void>}
   */
  async registerModules(modules) {
    const compatible = modules.filter((m) =>
      ["noflo", "noflo-nodejs"].includes(m.runtime),
    );
    /** @type {string[]} */
    const componentLoaders = [];
    await Promise.all(
      compatible.map(async (m) => {
        if (m.icon) {
          this.setLibraryIcon(m.name, m.icon);
        }

        if (m.noflo?.loader) {
          const loaderPath = path.resolve(this.baseDir, m.base, m.noflo.loader);
          componentLoaders.push(loaderPath);
        }

        await Promise.all(
          m.components.map(async (c) => {
            const extension = path.extname(c.path);
            if (extension === ".fbp" || extension === ".json") {
              // Graph files register as pre-parsed graph models
              const graph = await loadGraphFile(
                path.resolve(this.baseDir, c.path),
              );
              this.registerComponent(m.name, c.name, graph);
              return;
            }
            const language = utils.guessLanguageFromFilename(c.path);
            if (language === "typescript") {
              // We can't require a module that requires transpilation, go
              // the setSource route
              const source = await readFile(
                path.resolve(this.baseDir, c.path),
                "utf-8",
              );
              await this.storeSource(m.name, c.name, source, language);
              return;
            }
            const implementation = await importDefinition(
              path.resolve(this.baseDir, c.path),
            );
            this.registerComponent(m.name, c.name, implementation);
            this.registerSpecs(m.name, c.name, c.tests);
          }),
        );
      }),
    );
    await this.registerCustomLoaders(componentLoaders);
  }

  /**
   * Run custom component loader modules (`noflo.loader` in package
   * manifests). The plugin receives a registration shim exposing
   * `registerComponent`, `registerGraph`, and `setLibraryIcon`.
   *
   * @param {string[]} componentLoaders
   * @returns {Promise<void>}
   */
  async registerCustomLoaders(componentLoaders) {
    for (const componentLoader of componentLoaders) {
      // eslint-disable-next-line no-await-in-loop
      const customLoader = await serializeEvaluation(
        () => import(componentLoader),
      );
      let loaderFunc = customLoader;
      if (typeof customLoader === "object" && customLoader.default) {
        // CommonJS loader
        loaderFunc = customLoader.default;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.registerLoaderPlugin(loaderFunc);
    }
  }

  /**
   * Invoke a custom loader plugin with a registration shim.
   *
   * @param {Function} loaderFunc
   * @returns {Promise<void>}
   */
  registerLoaderPlugin(loaderFunc) {
    const shim = {
      registerComponent: (packageId, name, definition) => {
        this.registerComponent(packageId, name, definition);
      },
      registerGraph: (packageId, name, graph) => {
        this.registerComponent(packageId, name, graph);
      },
      setLibraryIcon: (prefix, icon) => {
        this.setLibraryIcon(prefix, icon);
      },
    };
    return new Promise((resolve, reject) => {
      loaderFunc(shim, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  // ### ComponentRegistry contract

  /**
   * The component catalog. Synchronous: the registry is ready and
   * populated once `createNodeModulesRegistry` resolves.
   *
   * @returns {Object<string, ComponentImplementation>}
   */
  list() {
    return this.components;
  }

  /**
   * Resolve a component implementation by name. Async per the registry
   * contract so lazy registries (browser ESM-URL maps) fit the same
   * interface.
   *
   * @param {string} name
   * @returns {Promise<ComponentImplementation|undefined>}
   */
  async get(name) {
    const direct = this.components[name];
    if (direct) {
      return direct;
    }
    // Try an alias
    const keys = Object.keys(this.components);
    for (let i = 0; i < keys.length; i += 1) {
      const componentName = keys[i];
      if (componentName.split("/")[1] === name) {
        return this.components[componentName];
      }
    }
    return undefined;
  }

  /**
   * Store a component source, transpile and evaluate it, and replace
   * the implementation in the catalog. Dispatches `change` on success.
   *
   * @param {string} packageId
   * @param {string} name
   * @param {string} source
   * @param {string} language
   * @returns {Promise<void>}
   */
  async setSource(packageId, name, source, language) {
    await this.storeSource(packageId, name, source, language);
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: {
          name: `${packageId}/${name}`,
        },
      }),
    );
  }

  /**
   * Return stored source metadata for a component, including fbp-spec
   * tests where available.
   *
   * @param {string} name
   * @returns {Promise<ComponentSources>}
   */
  async getSource(name) {
    let componentName = name;
    let component = this.components[name];
    if (!component) {
      // Try an alias
      const keys = Object.keys(this.components);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (key.split("/")[1] === name) {
          component = this.components[key];
          componentName = key;
          break;
        }
      }
      if (!component) {
        throw new Error(`Component ${componentName} not installed`);
      }
    }

    const nameParts = componentName.split("/");
    if (nameParts.length === 1) {
      nameParts[1] = nameParts[0];
      nameParts[0] = "";
    }

    /**
     * @param {ComponentSources} src
     * @returns {Promise<ComponentSources>}
     */
    const withSpecs = async (src) => {
      const specPath = this.specsForComponents[componentName];
      if (!specPath) {
        return src;
      }
      try {
        const specs = await readFile(
          path.resolve(this.baseDir, specPath),
          "utf-8",
        );
        return {
          ...src,
          tests: specs,
        };
      } catch (_e) {
        // Ignore spec reading errors
        return src;
      }
    };

    if (component instanceof GraphModel) {
      return withSpecs({
        name: nameParts[1],
        library: nameParts[0],
        code: JSON.stringify(exportFbpJson(component)),
        language: "json",
      });
    }

    if (this.sourcesForComponents[componentName]) {
      return withSpecs({
        name: nameParts[1],
        library: nameParts[0],
        code: this.sourcesForComponents[componentName].source,
        language: this.sourcesForComponents[componentName].language,
      });
    }

    throw new Error(`Can't provide source for ${componentName}. Not a file`);
  }

  // ### Extras beyond the contract

  /**
   * Register a component implementation at runtime. Also used by custom
   * loader plugins through the registration shim.
   *
   * @param {string|null} packageId
   * @param {string} name
   * @param {ComponentImplementation} definition
   */
  registerComponent(packageId, name, definition) {
    const prefix = this.getModulePrefix(packageId);
    const fullName = packageId ? `${prefix}/${name}` : name;
    this.components[fullName] = definition;
  }

  /**
   * @param {string} prefix
   * @param {string} icon
   */
  setLibraryIcon(prefix, icon) {
    this.libraryIcons[prefix] = icon;
  }

  /**
   * Signal that the whole catalog has been mutated externally and needs
   * re-reading by consumers.
   */
  invalidate() {
    this.dispatchEvent(new CustomEvent("invalidate"));
  }

  /**
   * Supported component source languages for `setSource`. TypeScript is
   * available when a TypeScript compiler is installed.
   *
   * @returns {string[]}
   */
  getLanguages() {
    const languages = ["javascript", "es2015"];
    if (typescript) {
      languages.push("typescript");
    }
    return languages;
  }

  // ### Internals

  /**
   * @param {string|null} packageId
   * @returns {string}
   */
  getModulePrefix(packageId) {
    if (!packageId) {
      return "";
    }
    let res = packageId;
    if (res === "noflo") {
      return "";
    }
    if (res[0] === "@") {
      res = res.replace(/@[a-z-]+\//, "");
    }
    return res.replace(/^noflo-/, "");
  }

  /**
   * @param {string} packageId
   * @param {string} name
   * @param {string} source
   * @param {string} language
   * @returns {Promise<void>}
   */
  async storeSource(packageId, name, source, language) {
    const src = await transpileSource(packageId, name, source, language);
    const implementation = await serializeEvaluation(() =>
      evaluateModule(this.baseDir, packageId, name, src),
    );
    const componentName = `${packageId}/${name}`;
    this.sourcesForComponents[componentName] = {
      language,
      source,
    };
    this.registerComponent(packageId, name, implementation);
  }

  /**
   * @param {string} packageId
   * @param {string} name
   * @param {string} [specs]
   */
  registerSpecs(packageId, name, specs) {
    if (!specs || specs.indexOf(".yaml") === -1) {
      // We support only fbp-spec specs
      return;
    }
    const componentName = `${packageId}/${name}`;
    this.specsForComponents[componentName] = specs;
  }
}

/**
 * Create a ready-to-hand-off component registry by discovering components
 * from the project directory and its node_modules dependencies.
 *
 * @param {string} baseDir - Project base directory
 * @param {NodeModulesRegistryOptions} [options]
 * @returns {Promise<NodeModulesRegistry>}
 */
export async function createNodeModulesRegistry(baseDir, options = {}) {
  const registry = new NodeModulesRegistry(baseDir, options);
  await registry.discover();
  return registry;
}

export { loadGraphFile, loadGraphJson, saveGraphFile } from "./graphFile.js";
