/* eslint-disable
    global-require,
    import/no-dynamic-require,
    no-underscore-dangle,
    prefer-destructuring,
*/
const path = require('path');
const fs = require('fs');
const manifest = require('fbp-manifest');
const fbpGraph = require('fbp-graph');

const utils = require('../Utils');

// Type loading CoffeeScript compiler
let CoffeeScript;
try {
  // eslint-disable-next-line import/no-unresolved
  CoffeeScript = require('coffeescript');
  if (typeof CoffeeScript.register !== 'undefined') {
    CoffeeScript.register();
  }
} catch (e) {
  // If there is no CoffeeScript compiler installed, we simply don't support compiling
}

// Try loading TypeScript compiler
let typescript;
try {
  // eslint-disable-next-line import/no-unresolved
  typescript = require('typescript');
} catch (e) {
  // If there is no TypeScript compiler installed, we simply don't support compiling
}

function registerCustomLoaders(loader, componentLoaders, callback) {
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
}

function registerModules(loader, modules, callback) {
  const compatible = modules.filter((m) => ['noflo', 'noflo-nodejs'].includes(m.runtime));
  const componentLoaders = [];
  compatible.forEach((m) => {
    if (m.icon) { loader.setLibraryIcon(m.name, m.icon); }

    if (m.noflo != null ? m.noflo.loader : undefined) {
      const loaderPath = path.resolve(loader.baseDir, m.base, m.noflo.loader);
      componentLoaders.push(loaderPath);
    }

    m.components.forEach((c) => {
      loader.registerComponent(m.name, c.name, path.resolve(loader.baseDir, c.path));
    });
  });

  registerCustomLoaders(loader, componentLoaders, callback);
}

const dynamicLoader = {
  listComponents(loader, manifestOptions, callback) {
    const opts = manifestOptions;
    opts.discover = true;
    manifest.list.list(loader.baseDir, opts, (err, modules) => {
      if (err) {
        callback(err);
        return;
      }
      registerModules(loader, modules, (err2) => {
        if (err2) {
          callback(err2);
          return;
        }
        callback(null, modules);
      });
    });
  },
};

const manifestLoader = {
  writeCache(loader, options, manifestContents, callback) {
    const filePath = path.resolve(loader.baseDir, options.manifest);
    fs.writeFile(filePath, JSON.stringify(manifestContents, null, 2),
      { encoding: 'utf-8' },
      callback);
  },

  readCache(loader, options, callback) {
    const opts = options;
    opts.discover = false;
    manifest.load.load(loader.baseDir, opts, callback);
  },

  prepareManifestOptions(loader) {
    const l = loader;
    if (!l.options) { l.options = {}; }
    const options = {};
    options.runtimes = l.options.runtimes || [];
    if (options.runtimes.indexOf('noflo') === -1) { options.runtimes.push('noflo'); }
    options.recursive = typeof l.options.recursive === 'undefined' ? true : l.options.recursive;
    options.manifest = l.options.manifest || 'fbp.json';
    return options;
  },

  listComponents(loader, manifestOptions, callback) {
    this.readCache(loader, manifestOptions, (err, manifestContents) => {
      if (err) {
        if (!loader.options.discover) {
          callback(err);
          return;
        }
        dynamicLoader.listComponents(loader, manifestOptions, (err2, modules) => {
          if (err2) {
            callback(err2);
            return;
          }
          this.writeCache(loader, manifestOptions, {
            version: 1,
            modules,
          },
          (err3) => {
            if (err3) {
              callback(err3);
              return;
            }
            callback(null, modules);
          });
        });
        return;
      }
      registerModules(loader, manifestContents.modules, (err2) => {
        if (err2) {
          callback(err2);
          return;
        }
        callback(null, manifestContents.modules);
      });
    });
  },
};

function registerSubgraph(loader) {
  // Inject subgraph component
  const graphPath = path.resolve(__dirname, '../../components/Graph.js');
  loader.registerComponent(null, 'Graph', graphPath);
}

exports.register = function register(loader, callback) {
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

exports.dynamicLoad = function dynamicLoad(name, cPath, metadata, callback) {
  let implementation; let instance;
  try {
    implementation = require(cPath);
  } catch (err) {
    callback(err);
    return;
  }

  if (typeof implementation.getComponent === 'function') {
    try {
      instance = implementation.getComponent(metadata);
    } catch (err) {
      callback(err);
      return;
    }
  } else if (typeof implementation === 'function') {
    try {
      instance = implementation(metadata);
    } catch (err) {
      callback(err);
      return;
    }
  } else {
    callback(new Error(`Unable to instantiate ${cPath}`));
    return;
  }
  if (typeof name === 'string') { instance.componentName = name; }
  callback(null, instance);
};

exports.setSource = function setSource(loader, packageId, name, source, language, callback) {
  const Module = require('module');
  let src;
  switch (language) {
    case 'coffeescript': {
      if (!CoffeeScript) {
        callback(new Error(`Unsupported component source language ${language} for ${packageId}/${name}: no CoffeeScript compiler installed`));
      }
      try {
        src = CoffeeScript.compile(source, {
          bare: true,
        });
      } catch (err) {
        callback(err);
        return;
      }
      break;
    }
    case 'typescript': {
      if (!typescript) {
        callback(new Error(`Unsupported component source language ${language} for ${packageId}/${name}: no TypeScript compiler installed`));
      }
      try {
        src = typescript.transpileModule(source, {
          compilerOptions: {
            module: typescript.ModuleKind.CommonJS,
          },
        });
      } catch (err) {
        callback(err);
        return;
      }
      break;
    }
    case 'es6':
    case 'es2015':
    case 'js':
    case 'javascript': {
      src = source;
      break;
    }
    default: {
      callback(new Error(`Unsupported component source language ${language} for ${packageId}/${name}`));
      return;
    }
  }
  let implementation;
  try {
    // Use the Node.js module API to evaluate in the correct directory context
    const modulePath = path.resolve(loader.baseDir, `./components/${name}.js`);
    const moduleImpl = new Module(modulePath, module);
    moduleImpl.paths = Module._nodeModulePaths(path.dirname(modulePath));
    moduleImpl.filename = modulePath;
    moduleImpl._compile(src, modulePath);
    implementation = moduleImpl.exports;
  } catch (err) {
    callback(err);
    return;
  }
  if ((typeof implementation !== 'function') && (typeof implementation.getComponent !== 'function')) {
    callback(new Error(`Provided source for ${packageId}/${name} failed to create a runnable component`));
    return;
  }

  loader.registerComponent(packageId, name, implementation, callback);
};

exports.getSource = function getSource(loader, name, callback) {
  let componentName = name;
  let component = loader.components[name];
  if (!component) {
    // Try an alias
    const keys = Object.keys(loader.components);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key.split('/')[1] === name) {
        component = loader.components[key];
        componentName = key;
        break;
      }
    }
    if (!component) {
      callback(new Error(`Component ${componentName} not installed`));
      return;
    }
  }

  const nameParts = componentName.split('/');
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
      callback(new Error(`Can't provide source for ${componentName}. Not a file`));
      return;
    }
    fbpGraph.graph.loadFile(component, (err, graph) => {
      if (err) {
        callback(err);
        return;
      }
      if (!graph) {
        callback(new Error('Unable to load graph'));
        return;
      }
      callback(null, {
        name: nameParts[1],
        library: nameParts[0],
        code: JSON.stringify(graph.toJSON()),
        language: 'json',
      });
    });
    return;
  }

  if (typeof component !== 'string') {
    callback(new Error(`Can't provide source for ${componentName}. Not a file`));
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

exports.getLanguages = function getLanguages() {
  const languages = ['javascript', 'es2015'];
  if (CoffeeScript) {
    languages.push('coffeescript');
  }
  if (typescript) {
    languages.push('typescript');
  }
  return languages;
};
