//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2017 Flowhub UG
//     (c) 2013 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./ComponentLoader.d.ts" */

/* eslint-disable
    class-methods-use-this,
    import/no-unresolved,
    import/prefer-default-export,
*/

import { GraphModel } from "@noflo/graph";
import { Subgraph } from "../components/Subgraph.js";
import { deprecated } from "./Platform.js";

/**
 * @callback ComponentFactory
 * @param {Object<string, any>} [metadata]
 * @returns {import("./Component.js").Component}
 */

/**
 * @typedef {Object} ModuleComponent
 * @property {ComponentFactory} getComponent
 */

// eslint-disable-next-line max-len
/** @typedef {ModuleComponent | ComponentFactory | import("@noflo/graph").GraphModel } ComponentDefinition */

/**
 * @typedef {Object<string, ComponentDefinition>} ComponentList
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
 * @typedef ComponentLoaderOptions
 * @property {ComponentRegistry} [registry] - Application-supplied component registry. The loader reads `list()` synchronously at construction and resolves names through `get`.
 */

/**
 * Application-supplied component registry (work documents #6 and #16).
 * Registries are assumed ready and populated at handoff: `list` is a
 * synchronous read of the catalog, `get` is the async lazy-resolution
 * path (for example importing an ESM URL in the browser).
 *
 * Registries backed by live systems (FBP protocol runtimes, IDE
 * sessions) may be EventTargets dispatching:
 *
 * - `change` (`detail: { name }`): a component implementation was
 *   updated or added. The loader refreshes its cache entry.
 * - `invalidate`: the whole catalog changed and needs re-reading.
 *
 * Static registries simply never dispatch.
 *
 * @typedef {Object} ComponentRegistry
 * @property {() => ComponentList} list - Provide the component catalog. Synchronous; entries win over manual registration on name conflicts when present at construction.
 * @property {(name: string) => Promise<ComponentDefinition|undefined>} [get] - Resolve a component implementation by name, including names not present in `list` (#593 dummy components).
 * @property {(packageId: string, name: string, source: string, language: string) => Promise<void>} [setSource] - Store component source. Registry concern only.
 * @property {(name: string) => Promise<ComponentSources>} [getSource] - Return stored source metadata for a component. Registry concern only.
 */

// ## The NoFlo Component Loader
//
// The Component Loader is responsible for instantiating components
// available in the running system.
//
// The loader consumes an application-supplied `ComponentRegistry` plus
// manual `registerComponent` calls. Component definitions are
// platform-neutral values: factory functions, ESM module objects with
// `getComponent`, or live graph models. No path strings, no source
// evaluation, no discovery in core: platform-specific discovery lives
// in registry implementations like `@noflo/loader-node`, and browser
// applications pass a static ESM-URL registry.
export class ComponentLoader {
  /**
   * Create a component loader. When an application registry is supplied, its
   * catalog is read synchronously at construction and the loader subscribes
   * to its `change` and `invalidate` events (if any) to keep the cache in
   * sync.
   *
   * @param {ComponentLoaderOptions} [options]
   */
  constructor(options = {}) {
    /**
     * Loader configuration
     * @type {ComponentLoaderOptions}
     */
    this.options = options;
    /**
     * Application-supplied registry
     * @type {ComponentRegistry|null}
     */
    this.registry = this.options.registry || null;
    /**
     * Component catalog, keyed by full component name
     * @type {ComponentList|null}
     */
    this.components = {};
    /**
     * Icon names declared per library prefix
     * @type {Object<string, string>}
     */
    this.libraryIcons = {};

    // The registry catalog is read synchronously at construction: a
    // registry is ready and populated at handoff. Registry entries win
    // over manual registration on name conflicts, matching the #6
    // precedence.
    if (this.registry && typeof this.registry.list === "function") {
      const list = this.registry.list();
      Object.keys(list || {}).forEach((name) => {
        this.components[name] = list[name];
      });
    }

    // Work document #6: a registry that is an EventTarget can signal
    // component changes and list invalidations. The loader subscribes at
    // construction so the cache stays in sync with the registry.
    if (
      this.registry &&
      typeof (/** @type {any} */ (this.registry).addEventListener) ===
        "function"
    ) {
      /** @type {any} */ (this.registry).addEventListener(
        "change",
        (/** @type {any} */ event) => {
          const name = event.detail?.name;
          if (!name || !this.components) {
            return;
          }
          if (typeof this.registry?.get !== "function") {
            return;
          }
          Promise.resolve(this.registry.get(name))
            .then((impl) => {
              if (!this.components) {
                return;
              }
              if (impl) {
                this.components[name] = impl;
              } else {
                delete this.components[name];
              }
            })
            .catch(() => {});
        },
      );
      /** @type {any} */ (this.registry).addEventListener("invalidate", () => {
        this.components = {};
        if (this.registry && typeof this.registry.list === "function") {
          const list = this.registry.list();
          Object.keys(list || {}).forEach((name) => {
            this.components[name] = list[name];
          });
        }
      });
    }
  }

  /**
   * Get the library prefix for a given module name. This is mostly used for
   * generating valid names for namespaced NPM modules, as well as for
   * convenience renaming all `noflo-` prefixed modules with just their base
   * name.
   *
   * Examples:
   *
   * - `my-project` becomes `my-project`
   * - `@foo/my-project` becomes `my-project`
   * - `noflo-core` becomes `core`
   *
   * @param {string} name
   * @returns {string}
   */
  getModulePrefix(name) {
    if (!name) {
      return "";
    }
    let res = name;
    if (res === "noflo") {
      return "";
    }
    if (res[0] === "@") {
      res = res.replace(/@[a-z-]+\//, "");
    }
    return res.replace(/^noflo-/, "");
  }

  /**
   * Get the list of all available components. The catalog is already
   * populated at construction, so the returned Promise resolves
   * immediately.
   *
   * @returns {Promise<ComponentList>} Promise resolving to list of loaded components
   */
  listComponents() {
    return Promise.resolve(this.components);
  }

  /**
   * Load an instance of a specific component. If the registered component is
   * a graph model or FBP JSON definition, it will be loaded as an instance of
   * the NoFlo subgraph component.
   *
   * @param {string} name - Component name
   * @param {Object<string, any>} [meta] - Node metadata
   * @returns {Promise<import("./Component.js").Component>}
   */
  load(name, meta) {
    const metadata = meta;

    const promise = new Promise((resolve, reject) => {
      if (!this.components) {
        reject(new Error(`Component ${name} not available`));
        return;
      }
      let component = this.components[name];
      if (!component) {
        // Try an alias
        const keys = Object.keys(this.components);
        for (let i = 0; i < keys.length; i += 1) {
          const componentName = keys[i];
          if (componentName.split("/")[1] === name) {
            component = this.components[componentName];
            break;
          }
        }
      }
      if (!component) {
        // Work document #6: the application registry resolves names the
        // catalog does not know about (also covers #593 dummy-component
        // support for top-down design)
        if (this.registry && typeof this.registry.get === "function") {
          resolve(
            Promise.resolve(this.registry.get(name)).then((impl) => {
              if (!impl) {
                reject(new Error(`Component ${name} not available`));
                return undefined;
              }
              return impl;
            }),
          );
          return;
        }
      }
      if (!component) {
        // Failure to load
        reject(new Error(`Component ${name} not available`));
        return;
      }
      resolve(component);
    }).then((component) => {
      if (this.isGraph(component)) {
        // Subgraph extends Component; the cast keeps the union return of
        // this chain assignable to Promise<Component>
        return /** @type {Promise<import("./Component.js").Component>} */ (
          this.loadGraph(name, component, metadata)
        );
      }

      return this.createComponent(name, component, metadata).then(
        (instance) => {
          if (!instance) {
            return Promise.reject(
              new Error(`Component ${name} could not be loaded.`),
            );
          }
          const inst = instance;
          if (typeof name === "string") {
            inst.componentName = name;
          }

          if (inst.isLegacy()) {
            deprecated(
              `Component ${name} uses legacy NoFlo APIs. Please port to Process API`,
            );
          }

          this.setIcon(name, inst);
          return inst;
        },
      );
    });
    return promise;
  }

  /**
   * Creates an instance of a component.
   * @param {string} name
   * @param {ComponentDefinition} component
   * @param {Object<string, any>} [metadata]
   * @returns {Promise<import("./Component.js").Component>}
   */
  createComponent(name, component, metadata) {
    const implementation = component;
    if (!implementation) {
      return Promise.reject(new Error(`Component ${name} not available`));
    }

    // Attempt to create the component instance using the `getComponent` method.
    let instance;
    const impl = /** @type ModuleComponent */ (implementation);
    if (typeof impl.getComponent === "function") {
      try {
        instance = impl.getComponent(metadata);
      } catch (error) {
        return Promise.reject(error);
      }
      // Attempt to create a component using a factory function.
    } else if (typeof implementation === "function") {
      try {
        instance = implementation(metadata);
      } catch (error) {
        return Promise.reject(error);
      }
    } else {
      return Promise.reject(
        new Error(
          `Invalid type ${typeof implementation} for component ${name}.`,
        ),
      );
    }
    return Promise.resolve(instance);
  }

  /**
   * Check whether a given value is a graph definition: a live graph model,
   * an FBP JSON object with a `nodes` array, or a `.json`/`.fbp` file path.
   *
   * @param {import("@noflo/graph").GraphModel|object|string} cPath
   * @returns {boolean}
   */
  isGraph(cPath) {
    // Live graph model instance
    if (cPath instanceof GraphModel) {
      return true;
    }
    if (typeof cPath !== "object") {
      return false;
    }
    // FBP JSON definition. `edges` may be absent on graphs without any
    // connections (for example a single node exposing exported ports).
    if (Array.isArray(cPath.nodes)) {
      return true;
    }
    // Legacy NoFlo JSON shape (processes/connections), accepted by the
    // FBP JSON import adapter
    if (
      typeof cPath.processes === "object" &&
      cPath.processes !== null &&
      !Array.isArray(cPath.processes)
    ) {
      return true;
    }
    return false;
  }

  // Load a graph as a NoFlo subgraph component instance
  /**
   * Load a graph definition as an instance of the subgraph component.
   *
   * @protected
   * @param {string} name
   * @param {import("@noflo/graph").GraphModel} component
   * @param {Object<string, any>} [metadata]
   * @returns {Promise<Subgraph>}
   */
  loadGraph(name, component, metadata) {
    // The subgraph wrapper is core machinery instantiated directly;
    // there is no user-loadable `Graph` catalog entry
    const subgraph = new Subgraph(metadata);
    // Cast bridges the source-inferred and declaration-emitted identities of
    // ComponentLoader (the protected loadGraph member makes them nominal)
    subgraph.loader =
      /** @type {import("./ComponentLoader.js").ComponentLoader} */ (
        /** @type {unknown} */ (this)
      );
    subgraph.inPorts.remove("graph");
    this.setIcon(name, subgraph);
    return subgraph.setGraph(component).then(() => subgraph);
  }

  // Set icon for the component instance. If the instance
  // has an icon set, then this is a no-op. Otherwise we
  /**
   * Determine an icon for a loaded component based on the module it comes
   * from, or use a fallback icon separately for subgraphs and elementary
   * components. Does nothing when the component already carries an icon.
   *
   * @param {string} name - Component name to derive the library icon from
   * @param {import("./Component.js").Component} instance
   */
  setIcon(name, instance) {
    // See if component has an icon
    if (!instance.getIcon || instance.getIcon()) {
      return;
    }

    // See if library has an icon
    const [library, componentName] = name.split("/");
    if (componentName && this.getLibraryIcon(library)) {
      instance.setIcon(this.getLibraryIcon(library));
      return;
    }

    // See if instance is a subgraph
    if (instance.isSubgraph()) {
      instance.setIcon("sitemap");
      return;
    }

    instance.setIcon("gear");
  }

  /**
   * Get the icon name registered for a library prefix, if any.
   *
   * @param {string} prefix
   * @returns {string|null}
   */
  getLibraryIcon(prefix) {
    if (this.libraryIcons[prefix]) {
      return this.libraryIcons[prefix];
    }
    return null;
  }

  /**
   * Register an icon name for a library prefix, used when instantiating
   * components from that library.
   *
   * @param {string} prefix
   * @param {string} icon
   */
  setLibraryIcon(prefix, icon) {
    this.libraryIcons[prefix] = icon;
  }

  /**
   * Build the full component name for a component inside a library,
   * normalizing the library prefix via the module prefix rules. A component
   * registered without a package id keeps its bare name.
   *
   * @param {string} packageId
   * @param {string} name
   * @returns {string}
   */
  normalizeName(packageId, name) {
    const prefix = this.getModulePrefix(packageId);
    let fullName = `${prefix}/${name}`;
    if (!packageId) {
      fullName = name;
    }
    return fullName;
  }

  /**
   * @callback ErrorableCallback
   * @param {Error|null} error
   * @returns {void}
   */

  /**
   * Register a NoFlo Component constructor or factory method as a component
   * available for loading, in addition to the components provided by the
   * registry.
   *
   * @param {string} packageId
   * @param {string} name
   * @param {ComponentDefinition} cPath
   * @returns {Promise<void>}
   */
  registerComponent(packageId, name, cPath) {
    const fullName = this.normalizeName(packageId, name);
    this.components[fullName] = cPath;
    return Promise.resolve();
  }

  /**
   * Register a graph model as a loadable component.
   *
   * @param {string} packageId
   * @param {string} name
   * @param {import("@noflo/graph").GraphModel} gPath
   * @returns {Promise<void>}
   */
  registerGraph(packageId, name, gPath) {
    return this.registerComponent(packageId, name, gPath);
  }

  /**
   * @callback CustomLoader
   * @param {ComponentLoader} loader
   * @param {ErrorableCallback} callback
   * @returns {void}
   */

  /**
   * Register a custom component loader. The plugin is invoked immediately
   * and can register any components or graphs it wishes. Registry
   * implementations like `@noflo/loader-node` drive this hook for
   * `noflo.loader` plugin modules discovered in package manifests; core
   * accepts plugins, it never discovers them.
   *
   * @param {CustomLoader} loader
   * @returns {Promise<void>}
   */
  registerLoader(loader) {
    const promise = new Promise((resolve, reject) => {
      loader(this, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    return promise;
  }

  /**
   * Empty the component catalog and re-read the registry catalog, if one is
   * configured.
   *
   * @returns {void}
   */
  clear() {
    this.components = {};
    if (this.registry && typeof this.registry.list === "function") {
      const list = this.registry.list();
      Object.keys(list || {}).forEach((name) => {
        this.components[name] = list[name];
      });
    }
  }
}
