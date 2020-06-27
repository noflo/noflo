/* eslint-disable
    consistent-return,
    func-names,
    global-require,
    import/no-dynamic-require,
    import/no-unresolved,
    no-param-reassign,
    no-restricted-syntax,
    no-shadow,
    no-underscore-dangle,
    no-use-before-define,
    no-var,
    prefer-destructuring,
    vars-on-top,
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
const path = require('path');
const fs = require('fs');
const manifest = require('fbp-manifest');
const fbpGraph = require('fbp-graph');

// We allow components to be un-compiled CoffeeScript
const CoffeeScript = require('coffeescript');
const utils = require('../Utils');

if (typeof CoffeeScript.register !== 'undefined') {
  CoffeeScript.register();
}

var registerCustomLoaders = function (loader, componentLoaders, callback) {
  if (!componentLoaders.length) {
    callback(null);
    return;
  }
  const customLoader = require(componentLoaders.shift());
  loader.registerLoader(customLoader, (err) => {
    if (err) {
      callback(err);
      return;
    }
    registerCustomLoaders(loader, componentLoaders, callback);
  });
};

const registerModules = function (loader, modules, callback) {
  const compatible = modules.filter((m) => ['noflo', 'noflo-nodejs'].includes(m.runtime));
  const componentLoaders = [];
  for (const m of Array.from(compatible)) {
    if (m.icon) { loader.setLibraryIcon(m.name, m.icon); }

    if (m.noflo != null ? m.noflo.loader : undefined) {
      const loaderPath = path.resolve(loader.baseDir, m.base, m.noflo.loader);
      componentLoaders.push(loaderPath);
    }

    for (const c of Array.from(m.components)) {
      loader.registerComponent(m.name, c.name, path.resolve(loader.baseDir, c.path));
    }
  }

  registerCustomLoaders(loader, componentLoaders, callback);
};

const manifestLoader = {
  writeCache(loader, options, manifest, callback) {
    const filePath = path.resolve(loader.baseDir, options.manifest);
    fs.writeFile(filePath, JSON.stringify(manifest, null, 2),
      { encoding: 'utf-8' },
      callback);
  },

  readCache(loader, options, callback) {
    options.discover = false;
    manifest.load.load(loader.baseDir, options, callback);
  },

  prepareManifestOptions(loader) {
    if (!loader.options) { loader.options = {}; }
    const options = {};
    options.runtimes = loader.options.runtimes || [];
    if (options.runtimes.indexOf('noflo') === -1) { options.runtimes.push('noflo'); }
    options.recursive = typeof loader.options.recursive === 'undefined' ? true : loader.options.recursive;
    options.manifest = loader.options.manifest || 'fbp.json';
    return options;
  },

  listComponents(loader, manifestOptions, callback) {
    this.readCache(loader, manifestOptions, (err, manifest) => {
      if (err) {
        if (!loader.options.discover) {
          callback(err);
          return;
        }
        dynamicLoader.listComponents(loader, manifestOptions, (err, modules) => {
          if (err) {
            callback(err);
            return;
          }
          return this.writeCache(loader, manifestOptions, {
            version: 1,
            modules,
          },
          (err) => {
            if (err) {
              callback(err);
              return;
            }
            callback(null, modules);
          });
        });
        return;
      }
      registerModules(loader, manifest.modules, (err) => {
        if (err) {
          callback(err);
          return;
        }
        callback(null, manifest.modules);
      });
    });
  },
};

var dynamicLoader = {
  listComponents(loader, manifestOptions, callback) {
    manifestOptions.discover = true;
    manifest.list.list(loader.baseDir, manifestOptions, (err, modules) => {
      if (err) {
        callback(err);
        return;
      }
      registerModules(loader, modules, (err) => {
        if (err) {
          callback(err);
          return;
        }
        callback(null, modules);
      });
    });
  },
};

const registerSubgraph = function (loader) {
  // Inject subgraph component
  let graphPath;
  if (path.extname(__filename) === '.js') {
    graphPath = path.resolve(__dirname, '../../components/Graph.js');
  } else {
    graphPath = path.resolve(__dirname, '../../components/Graph.coffee');
  }
  loader.registerComponent(null, 'Graph', graphPath);
};

exports.register = function (loader, callback) {
  const manifestOptions = manifestLoader.prepareManifestOptions(loader);

  if (loader.options != null ? loader.options.cache : undefined) {
    manifestLoader.listComponents(loader, manifestOptions, (err, modules) => {
      if (err) {
        callback(err);
        return;
      }
      registerSubgraph(loader);
      callback(null, modules);
    });
    return;
  }

  dynamicLoader.listComponents(loader, manifestOptions, (err, modules) => {
    if (err) {
      callback(err);
      return;
    }
    registerSubgraph(loader);
    callback(null, modules);
  });
};

exports.dynamicLoad = function (name, cPath, metadata, callback) {
  let e; let implementation; let
    instance;
  try {
    implementation = require(cPath);
  } catch (error) {
    e = error;
    callback(e);
    return;
  }

  if (typeof implementation.getComponent === 'function') {
    try {
      instance = implementation.getComponent(metadata);
    } catch (error1) {
      e = error1;
      callback(e);
      return;
    }
  } else if (typeof implementation === 'function') {
    try {
      instance = implementation(metadata);
    } catch (error2) {
      e = error2;
      callback(e);
      return;
    }
  } else {
    callback(new Error(`Unable to instantiate ${cPath}`));
    return;
  }
  if (typeof name === 'string') { instance.componentName = name; }
  callback(null, instance);
};

exports.setSource = function (loader, packageId, name, source, language, callback) {
  let e; let
    implementation;
  const Module = require('module');
  if (language === 'coffeescript') {
    try {
      source = CoffeeScript.compile(source,
        { bare: true });
    } catch (error) {
      e = error;
      callback(e);
      return;
    }
  }
  try {
    // Use the Node.js module API to evaluate in the correct directory context
    const modulePath = path.resolve(loader.baseDir, `./components/${name}.js`);
    const moduleImpl = new Module(modulePath, module);
    moduleImpl.paths = Module._nodeModulePaths(path.dirname(modulePath));
    moduleImpl.filename = modulePath;
    moduleImpl._compile(source, modulePath);
    implementation = moduleImpl.exports;
  } catch (error1) {
    e = error1;
    callback(e);
    return;
  }
  if ((typeof implementation !== 'function') && (typeof implementation.getComponent !== 'function')) {
    callback(new Error('Provided source failed to create a runnable component'));
    return;
  }

  loader.registerComponent(packageId, name, implementation, callback);
};

exports.getSource = function (loader, name, callback) {
  let component = loader.components[name];
  if (!component) {
    // Try an alias
    for (const componentName in loader.components) {
      if (componentName.split('/')[1] === name) {
        component = loader.components[componentName];
        name = componentName;
        break;
      }
    }
    if (!component) {
      callback(new Error(`Component ${name} not installed`));
      return;
    }
  }

  const nameParts = name.split('/');
  if (nameParts.length === 1) {
    nameParts[1] = nameParts[0];
    nameParts[0] = '';
  }

  if (loader.isGraph(component)) {
    if (typeof component === 'object') {
      if (typeof component.toJSON === 'function') {
        callback(null, {
          name: nameParts[1],
          library: nameParts[0],
          code: JSON.stringify(component.toJSON()),
          language: 'json',
        });
        return;
      }
      callback(new Error(`Can't provide source for ${name}. Not a file`));
      return;
    }
    fbpGraph.graph.loadFile(component, (err, graph) => {
      if (err) {
        callback(err);
        return;
      }
      if (!graph) { return callback(new Error('Unable to load graph')); }
      return callback(null, {
        name: nameParts[1],
        library: nameParts[0],
        code: JSON.stringify(graph.toJSON()),
        language: 'json',
      });
    });
    return;
  }

  if (typeof component !== 'string') {
    callback(new Error(`Can't provide source for ${name}. Not a file`));
    return;
  }

  fs.readFile(component, 'utf-8', (err, code) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, {
      name: nameParts[1],
      library: nameParts[0],
      language: utils.guessLanguageFromFilename(component),
      code,
    });
  });
};
