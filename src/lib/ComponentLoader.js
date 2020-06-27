/* eslint-disable
    class-methods-use-this,
    consistent-return,
    import/no-unresolved,
    no-param-reassign,
    no-restricted-syntax,
    no-shadow,
    no-unreachable,
    no-useless-escape,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2013 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
const fbpGraph = require('fbp-graph');
const { EventEmitter } = require('events');
const registerLoader = require('./loader/register');
const platform = require('./Platform');

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
class ComponentLoader extends EventEmitter {
  constructor(baseDir, options) {
    if (options == null) { options = {}; }
    super();
    this.baseDir = baseDir;
    this.options = options;
    this.components = null;
    this.libraryIcons = {};
    this.processing = false;
    this.ready = false;
    this.setMaxListeners(0);
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
  getModulePrefix(name) {
    if (!name) { return ''; }
    if (name === 'noflo') { return ''; }
    if (name[0] === '@') { name = name.replace(/\@[a-z\-]+\//, ''); }
    return name.replace(/^noflo-/, '');
  }

  // Get the list of all available components
  listComponents(callback) {
    if (this.processing) {
      this.once('ready', () => callback(null, this.components));
      return;
    }
    if (this.components) { return callback(null, this.components); }

    this.ready = false;
    this.processing = true;

    this.components = {};
    registerLoader.register(this, (err) => {
      if (err) {
        return callback(err);
        throw err;
      }
      this.processing = false;
      this.ready = true;
      this.emit('ready', true);
      return callback(null, this.components);
    });
  }

  // Load an instance of a specific component. If the
  // registered component is a JSON or FBP graph, it will
  // be loaded as an instance of the NoFlo subgraph
  // component.
  load(name, callback, metadata) {
    let componentName;
    if (!this.ready) {
      this.listComponents((err) => {
        if (err) {
          callback(err);
          return;
        }
        return this.load(name, callback, metadata);
      });
      return;
    }

    let component = this.components[name];
    if (!component) {
      // Try an alias
      for (componentName in this.components) {
        if (componentName.split('/')[1] === name) {
          component = this.components[componentName];
          break;
        }
      }
      if (!component) {
        // Failure to load
        callback(new Error(`Component ${name} not available with base ${this.baseDir}`));
        return;
      }
    }

    if (this.isGraph(component)) {
      this.loadGraph(name, component, callback, metadata);
      return;
    }

    return this.createComponent(name, component, metadata, (err, instance) => {
      if (err) {
        callback(err);
        return;
      }
      if (!instance) {
        callback(new Error(`Component ${name} could not be loaded.`));
        return;
      }

      if (name === 'Graph') { instance.baseDir = this.baseDir; }
      if (typeof name === 'string') { instance.componentName = name; }

      if (instance.isLegacy()) {
        platform.deprecated(`Component ${name} uses legacy NoFlo APIs. Please port to Process API`);
      }

      this.setIcon(name, instance);
      return callback(null, instance);
    });
  }

  // Creates an instance of a component.
  createComponent(name, component, metadata, callback) {
    let e; let
      instance;
    const implementation = component;
    if (!implementation) {
      callback(new Error(`Component ${name} not available`));
      return;
    }

    // If a string was specified, attempt to `require` it.
    if (typeof implementation === 'string') {
      if (typeof registerLoader.dynamicLoad === 'function') {
        registerLoader.dynamicLoad(name, implementation, metadata, callback);
        return;
      }
      callback(Error(`Dynamic loading of ${implementation} for component ${name} not available on this platform.`));
      return;
    }

    // Attempt to create the component instance using the `getComponent` method.
    if (typeof implementation.getComponent === 'function') {
      try {
        instance = implementation.getComponent(metadata);
      } catch (error) {
        e = error;
        callback(e);
        return;
      }
    // Attempt to create a component using a factory function.
    } else if (typeof implementation === 'function') {
      try {
        instance = implementation(metadata);
      } catch (error1) {
        e = error1;
        callback(e);
        return;
      }
    } else {
      callback(new Error(`Invalid type ${typeof (implementation)} for component ${name}.`));
      return;
    }

    return callback(null, instance);
  }

  // Check if a given filesystem path is actually a graph
  isGraph(cPath) {
    // Live graph instance
    if ((typeof cPath === 'object') && cPath instanceof fbpGraph.Graph) { return true; }
    // Graph JSON definition
    if ((typeof cPath === 'object') && cPath.processes && cPath.connections) { return true; }
    if (typeof cPath !== 'string') { return false; }
    // Graph file path
    return (cPath.indexOf('.fbp') !== -1) || (cPath.indexOf('.json') !== -1);
  }

  // Load a graph as a NoFlo subgraph component instance
  loadGraph(name, component, callback, metadata) {
    this.createComponent(name, this.components.Graph, metadata, (err, graph) => {
      if (err) {
        callback(err);
        return;
      }
      graph.loader = this;
      graph.baseDir = this.baseDir;
      graph.inPorts.remove('graph');
      graph.setGraph(component, (err) => {
        if (err) {
          callback(err);
          return;
        }
        this.setIcon(name, graph);
        return callback(null, graph);
      });
    });
  }

  // Set icon for the component instance. If the instance
  // has an icon set, then this is a no-op. Otherwise we
  // determine an icon based on the module it is coming
  // from, or use a fallback icon separately for subgraphs
  // and elementary components.
  setIcon(name, instance) {
    // See if component has an icon
    if (!instance.getIcon || instance.getIcon()) { return; }

    // See if library has an icon
    const [library, componentName] = Array.from(name.split('/'));
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

  getLibraryIcon(prefix) {
    if (this.libraryIcons[prefix]) {
      return this.libraryIcons[prefix];
    }
    return null;
  }

  setLibraryIcon(prefix, icon) {
    this.libraryIcons[prefix] = icon;
  }

  normalizeName(packageId, name) {
    const prefix = this.getModulePrefix(packageId);
    let fullName = `${prefix}/${name}`;
    if (!packageId) { fullName = name; }
    return fullName;
  }

  // ### Registering components at runtime
  //
  // In addition to components discovered by the loader,
  // it is possible to register components at runtime.
  //
  // With the `registerComponent` method you can register
  // a NoFlo Component constructor or factory method
  // as a component available for loading.
  registerComponent(packageId, name, cPath, callback) {
    const fullName = this.normalizeName(packageId, name);
    this.components[fullName] = cPath;
    if (callback) { callback(); }
  }

  // With the `registerGraph` method you can register new
  // graphs as loadable components.
  registerGraph(packageId, name, gPath, callback) {
    this.registerComponent(packageId, name, gPath, callback);
  }

  // With `registerLoader` you can register custom component
  // loaders. They will be called immediately and can register
  // any components or graphs they wish.
  registerLoader(loader, callback) {
    loader(this, callback);
  }

  // With `setSource` you can register a component by providing
  // a source code string. Supported languages and techniques
  // depend on the runtime environment, for example CoffeeScript
  // components can only be registered via `setSource` if
  // the environment has a CoffeeScript compiler loaded.
  setSource(packageId, name, source, language, callback) {
    if (!registerLoader.setSource) {
      callback(new Error('setSource not allowed'));
      return;
    }

    if (!this.ready) {
      this.listComponents((err) => {
        if (err) {
          callback(err);
          return;
        }
        return this.setSource(packageId, name, source, language, callback);
      });
      return;
    }

    registerLoader.setSource(this, packageId, name, source, language, callback);
  }

  // `getSource` allows fetching the source code of a registered
  // component as a string.
  getSource(name, callback) {
    if (!registerLoader.getSource) {
      callback(new Error('getSource not allowed'));
      return;
    }
    if (!this.ready) {
      this.listComponents((err) => {
        if (err) {
          callback(err);
          return;
        }
        return this.getSource(name, callback);
      });
      return;
    }

    registerLoader.getSource(this, name, callback);
  }

  clear() {
    this.components = null;
    this.ready = false;
    this.processing = false;
  }
}

exports.ComponentLoader = ComponentLoader;
