//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2013 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    class-methods-use-this,
    import/no-unresolved,
    import/prefer-default-export,
*/

import { Graph } from 'fbp-graph';
import * as registerLoader from './loader/register';
import { deprecated, makeAsync } from './Platform';

/**
 * @callback ComponentFactory
 * @param {import("fbp-graph/lib/Types").GraphNodeMetadata} [metadata]
 * @returns {import("./Component").Component}
 */

/**
 * @typedef {Object} ModuleComponent
 * @property {ComponentFactory} getComponent
 */

// eslint-disable-next-line max-len
/** @typedef {string | ModuleComponent | ComponentFactory | import("fbp-graph").Graph } ComponentDefinition */
/** @typedef {string | ModuleComponent | ComponentFactory } ComponentDefinitionWithoutGraph */

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
 * @property {boolean} [cache]
 * @property {boolean} [discover]
 * @property {boolean} [recursive]
 * @property {string[]} [runtimes]
 * @property {string} [manifest]
 */

// ## The NoFlo Component Loader
//
// The Component Loader is responsible for discovering components
// available in the running system, as well as for instantiating
// them.
//
// Internally the loader uses a registered, platform-specific
// loader. NoFlo ships with a loader for Node.js that discovers
// components from the current project's `components/` and
// `graphs/` folders, as well as those folders of any installed
// NPM dependencies. For browsers and embedded devices it is
// possible to generate a statically configured component
// loader using the [noflo-component-loader](https://github.com/noflo/noflo-component-loader) webpack plugin.
export class ComponentLoader {
  /**
   * @param {string} baseDir
   * @param {ComponentLoaderOptions} [options]
   */
  constructor(baseDir, options = {}) {
    this.baseDir = baseDir;
    this.options = options;
    /** @type {ComponentList|null} */
    this.components = null;
    /** @type {Object<string, string>} */
    this.libraryIcons = {};
    /** @type {Object<string, Object>} */
    this.sourcesForComponents = {};
    /** @type {Object<string, string>} */
    this.specsForComponents = {};
    /** @type {Promise<ComponentList> | null}; */
    this.processing = null;
    this.ready = false;
  }

  // Get the library prefix for a given module name. This
  // is mostly used for generating valid names for namespaced
  // NPM modules, as well as for convenience renaming all
  // `noflo-` prefixed modules with just their base name.
  //
  // Examples:
  //
  // * `my-project` becomes `my-project`
  // * `@foo/my-project` becomes `my-project`
  // * `noflo-core` becomes `core`
  /**
   * @param {string} name
   * @returns {string}
   */
  getModulePrefix(name) {
    if (!name) { return ''; }
    let res = name;
    if (res === 'noflo') { return ''; }
    if (res[0] === '@') { res = res.replace(/@[a-z-]+\//, ''); }
    return res.replace(/^noflo-/, '');
  }

  // Get the list of all available components
  /**
   * @param {any} [callback] - Legacy callback
   * @returning {Promise<ComponentList>} Promise resolving to list of loaded components
   */
  listComponents(callback) {
    let promise;
    if (this.processing) {
      promise = this.processing;
    } else if (this.ready && this.components) {
      promise = Promise.resolve(this.components);
    } else {
      this.components = {};
      this.ready = false;
      this.processing = new Promise((resolve, reject) => {
        makeAsync(() => {
          registerLoader.register(this, (err) => {
            if (err) {
              // We keep the failed promise here in this.processing
              reject(err);
              return;
            }
            this.ready = true;
            this.processing = null;
            resolve(this.components);
          });
        });
      });
      promise = this.processing;
    }
    if (callback) {
      deprecated('Providing a callback to ComponentLoader.listComponents is deprecated, use Promises');
      promise.then((components) => {
        callback(null, components);
      }, callback);
    }
    return promise;
  }

  // Load an instance of a specific component. If the
  // registered component is a JSON or FBP graph, it will
  // be loaded as an instance of the NoFlo subgraph
  // component.
  /**
   * @param {string} name - Component name
   * @param {import("fbp-graph/lib/Types").GraphNodeMetadata} meta - Node metadata
   * @param {any} [cb] - Legacy callback
   * @returns {Promise<import("./Component").Component>}
   */
  load(name, meta, cb) {
    let metadata = meta;
    let callback = cb;
    if (typeof meta === 'function') {
      callback = meta;
      metadata = cb;
    }
    if (!this.ready) {
      return this.listComponents()
        .then(() => this.load(name, meta, cb));
    }

    const promise = new Promise((resolve, reject) => {
      if (!this.components) {
        reject(new Error(`Component ${name} not available with base ${this.baseDir}`));
        return;
      }
      let component = this.components[name];
      if (!component) {
        // Try an alias
        const keys = Object.keys(this.components);
        for (let i = 0; i < keys.length; i += 1) {
          const componentName = keys[i];
          if (componentName.split('/')[1] === name) {
            component = this.components[componentName];
            break;
          }
        }
        if (!component) {
          // Failure to load
          reject(new Error(`Component ${name} not available with base ${this.baseDir}`));
          return;
        }
      }
      resolve(component);
    })
      .then((component) => {
        if (this.isGraph(component)) {
          return this.loadGraph(name, component, metadata);
        }

        return this.createComponent(name, component, metadata)
          .then((instance) => {
            if (!instance) {
              return Promise.reject(new Error(`Component ${name} could not be loaded.`));
            }
            const inst = instance;
            if (name === 'Graph') {
              inst.baseDir = this.baseDir;
            }
            if (typeof name === 'string') {
              inst.componentName = name;
            }

            if (inst.isLegacy()) {
              deprecated(`Component ${name} uses legacy NoFlo APIs. Please port to Process API`);
            }

            this.setIcon(name, inst);
            return inst;
          });
      });
    if (callback) {
      deprecated('Providing a callback to ComponentLoader.load is deprecated, use Promises');
      promise.then((instance) => {
        callback(null, instance);
      }, callback);
    }
    return promise;
  }

  // Creates an instance of a component.
  /**
   * @protected
   * @param {string} name
   * @param {ComponentDefinitionWithoutGraph} component
   * @param {import("fbp-graph/lib/Types").GraphNodeMetadata} metadata
   * @returns {Promise<import("./Component").Component>}
   */
  createComponent(name, component, metadata) {
    const implementation = component;
    if (!implementation) {
      return Promise.reject(new Error(`Component ${name} not available`));
    }

    // If a string was specified, attempt to `require` it.
    if (typeof implementation === 'string') {
      if (typeof registerLoader.dynamicLoad === 'function') {
        return new Promise((resolve, reject) => {
          registerLoader.dynamicLoad(name, implementation, metadata, (err, instance) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(instance);
          });
        });
      }
      return Promise.reject(Error(`Dynamic loading of ${implementation} for component ${name} not available on this platform.`));
    }

    // Attempt to create the component instance using the `getComponent` method.
    let instance;
    const impl = /** @type ModuleComponent */ (implementation);
    if (typeof impl.getComponent === 'function') {
      try {
        instance = impl.getComponent(metadata);
      } catch (error) {
        return Promise.reject(error);
      }
      // Attempt to create a component using a factory function.
    } else if (typeof implementation === 'function') {
      try {
        instance = implementation(metadata);
      } catch (error) {
        return Promise.reject(error);
      }
    } else {
      return Promise.reject(new Error(`Invalid type ${typeof (implementation)} for component ${name}.`));
    }
    return Promise.resolve(instance);
  }

  // Check if a given filesystem path is actually a graph
  /**
   * @param {import("fbp-graph").Graph|object|string} cPath
   * @returns {boolean}
   */
  isGraph(cPath) {
    // Live graph instance
    if ((typeof cPath === 'object')
      && (cPath instanceof Graph
        || (Array.isArray(cPath.nodes)
          && Array.isArray(cPath.edges)
          && Array.isArray(cPath.initializers)))) {
      return true;
    }
    // Graph JSON definition
    if ((typeof cPath === 'object') && cPath.processes && cPath.connections) { return true; }
    if (typeof cPath !== 'string') { return false; }
    // Graph file path
    return (cPath.indexOf('.fbp') !== -1) || (cPath.indexOf('.json') !== -1);
  }

  // Load a graph as a NoFlo subgraph component instance
  /**
   * @protected
   * @param {string} name
   * @param {import("fbp-graph").Graph} component
   * @param {import("fbp-graph/lib/Types").GraphNodeMetadata} metadata
   * @returns {Promise<import("../components/Graph").Graph>}
   */
  loadGraph(name, component, metadata) {
    const graphComponent = /** @type {ModuleComponent} */ (this.components.Graph);
    return this.createComponent(name, graphComponent, metadata)
      .then((graph) => {
        const g = /** @type {import("../components/Graph").Graph} */ (graph);
        g.loader = this;
        g.baseDir = this.baseDir;
        g.inPorts.remove('graph');
        this.setIcon(name, g);
        return g.setGraph(component)
          .then(() => g);
      });
  }

  // Set icon for the component instance. If the instance
  // has an icon set, then this is a no-op. Otherwise we
  // determine an icon based on the module it is coming
  // from, or use a fallback icon separately for subgraphs
  // and elementary components.
  /**
   * @param {string} name - Icon to set
   * @param {import("./Component").Component} instance
   */
  setIcon(name, instance) {
    // See if component has an icon
    if (!instance.getIcon || instance.getIcon()) { return; }

    // See if library has an icon
    const [library, componentName] = name.split('/');
    if (componentName && this.getLibraryIcon(library)) {
      instance.setIcon(this.getLibraryIcon(library));
      return;
    }

    // See if instance is a subgraph
    if (instance.isSubgraph()) {
      instance.setIcon('sitemap');
      return;
    }

    instance.setIcon('gear');
  }

  /**
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
   * @param {string} prefix
   * @param {string} icon
   */
  setLibraryIcon(prefix, icon) {
    this.libraryIcons[prefix] = icon;
  }

  /**
   * @param {string} packageId
   * @param {string} name
   * @returns {string}
   */
  normalizeName(packageId, name) {
    const prefix = this.getModulePrefix(packageId);
    let fullName = `${prefix}/${name}`;
    if (!packageId) { fullName = name; }
    return fullName;
  }

  /**
   * @callback ErrorableCallback
   * @param {Error|null} error
   * @returns {void}
   */

  // ### Registering components at runtime
  //
  // In addition to components discovered by the loader,
  // it is possible to register components at runtime.
  //
  // With the `registerComponent` method you can register
  // a NoFlo Component constructor or factory method
  // as a component available for loading.
  /**
   * @param {string} packageId
   * @param {string} name
   * @param {ComponentDefinition} cPath
   * @param {ErrorableCallback} [callback]
   */
  registerComponent(packageId, name, cPath, callback) {
    const fullName = this.normalizeName(packageId, name);
    this.components[fullName] = cPath;
    if (callback) {
      callback(null);
    }
  }

  // With the `registerGraph` method you can register new
  // graphs as loadable components.
  /**
   * @param {string} packageId
   * @param {string} name
   * @param {import("fbp-graph").Graph} gPath
   * @param {ErrorableCallback} [callback]
   */
  registerGraph(packageId, name, gPath, callback) {
    this.registerComponent(packageId, name, gPath, callback);
  }

  // With `registerLoader` you can register custom component
  // loaders. They will be called immediately and can register
  // any components or graphs they wish.
  /**
   * @callback CustomLoader
   * @param {ComponentLoader} loader
   * @param {ErrorableCallback} callback
   * @returns {void}
   */
  /**
   * @param {CustomLoader} loader
   * @param {ErrorableCallback} callback
   */
  registerLoader(loader, callback) {
    loader(this, callback);
  }

  // With `setSource` you can register a component by providing
  // a source code string. Supported languages and techniques
  // depend on the runtime environment, for example CoffeeScript
  // components can only be registered via `setSource` if
  // the environment has a CoffeeScript compiler loaded.
  /**
   * @param {string} packageId
   * @param {string} name
   * @param {string} source
   * @param {string} language
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<void>}
   */
  setSource(packageId, name, source, language, callback) {
    if (!this.ready) {
      return this.listComponents()
        .then(() => this.setSource(packageId, name, source, language, callback));
    }
    let promise;
    if (!registerLoader.setSource) {
      promise = Promise.reject(new Error('setSource not allowed'));
    } else {
      promise = new Promise((resolve, reject) => {
        registerLoader.setSource(this, packageId, name, source, language, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
    if (callback) {
      deprecated('Providing a callback to ComponentLoader.setSource is deprecated, use Promises');
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // `getSource` allows fetching the source code of a registered
  // component as a string.
  /**
   * @callback SourceCallback
   * @param {Error|null} error
   * @param {ComponentSources} [source]
   */
  /**
   * @param {string} name
   * @param {SourceCallback} [callback]
   * @returns {Promise<ComponentSources>}
   */
  getSource(name, callback) {
    if (!this.ready) {
      return this.listComponents()
        .then(() => this.getSource(name, callback));
    }
    let promise;
    if (!registerLoader.getSource) {
      promise = Promise.reject(new Error('getSource not allowed'));
    } else {
      promise = new Promise((resolve, reject) => {
        registerLoader.getSource(this, name, (err, source) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(source);
        });
      });
    }
    if (callback) {
      deprecated('Providing a callback to ComponentLoader.getSource is deprecated, use Promises');
      promise.then((source) => {
        callback(null, source);
      }, callback);
    }
    return promise;
  }

  // `getLanguages` gets a list of component programming languages supported by the `setSource`
  // method on this runtime instance.
  getLanguages() {
    if (!registerLoader.getLanguages) {
      // This component loader doesn't support the method, default to normal JS
      return ['javascript', 'es2015'];
    }
    return registerLoader.getLanguages();
  }

  clear() {
    this.components = null;
    this.sourcesForComponents = {};
    this.specsForComponents = {};
    this.ready = false;
    this.processing = null;
  }
}
