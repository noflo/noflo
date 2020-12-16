/* eslint-disable
    global-require,
    import/no-dynamic-require,
    no-underscore-dangle,
    prefer-destructuring,
*/
import * as path from 'path';
import * as fs from 'fs';
import * as manifest from 'fbp-manifest';
import * as fbpGraph from 'fbp-graph';
import { promisify } from 'util';
import * as utils from '../Utils';

const writeFile = promisify(fs.writeFile);

// Type loading CoffeeScript compiler
let CoffeeScript;
try {
  // eslint-disable-next-line import/no-unresolved,import/no-extraneous-dependencies
  CoffeeScript = require('coffeescript');
} catch (e) {
  // If there is no CoffeeScript compiler installed, we simply don't support compiling
}

// Try loading TypeScript compiler
let typescript;
try {
  // eslint-disable-next-line import/no-unresolved,import/no-extraneous-dependencies
  typescript = require('typescript');
} catch (e) {
  // If there is no TypeScript compiler installed, we simply don't support compiling
}

/**
 * @callback ErrorableCallback
 * @param {Error|null} error
 */
/**
 * @callback TranspileCallback
 * @param {Error|null} error
 * @param {string} [source]
 * @returns {void}
 */
/**
 * @param {string} packageId
 * @param {string} name
 * @param {string} source
 * @param {string} language
 * @param {TranspileCallback} callback
 * @returns {void}
 */
function transpileSource(packageId, name, source, language, callback) {
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
        src = typescript.transpile(source, {
          module: typescript.ModuleKind.CommonJS,
          target: typescript.ScriptTarget.ES2015,
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
  callback(null, src);
}

/**
 * @callback EvaluationCallback
 * @param {Error|null} error
 * @param {Object|Function} [module]
 * @returns {void}
 */
/**
 * @param {string} baseDir
 * @param {string} packageId
 * @param {string} name
 * @param {string} source
 * @param {EvaluationCallback} callback
 * @returns {void}
 */
function evaluateModule(baseDir, packageId, name, source, callback) {
  const Module = require('module');
  let implementation;
  try {
    // Use the Node.js module API to evaluate in the correct directory context
    const modulePath = path.resolve(baseDir, `./components/${name}.js`);
    const moduleImpl = new Module(modulePath, module);
    // @ts-ignore
    moduleImpl.paths = Module._nodeModulePaths(path.dirname(modulePath));
    moduleImpl.filename = modulePath;
    // @ts-ignore
    moduleImpl._compile(source, modulePath);
    implementation = moduleImpl.exports;
  } catch (e) {
    callback(e);
    return;
  }
  if ((typeof implementation !== 'function') && (typeof implementation.getComponent !== 'function')) {
    callback(new Error(`Provided source for ${packageId}/${name} failed to create a runnable component`));
    return;
  }
  callback(null, implementation);
}

/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {string} packageId
 * @param {string} name
 * @param {string} source
 * @param {string} language
 * @returns {void}
 */
function registerSources(loader, packageId, name, source, language) {
  const componentName = `${packageId}/${name}`;
  // eslint-disable-next-line no-param-reassign
  loader.sourcesForComponents[componentName] = {
    language,
    source,
  };
}

/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {string} packageId
 * @param {string} name
 * @param {string} specs
 * @returns {void}
 */
function registerSpecs(loader, packageId, name, specs) {
  if (!specs || specs.indexOf('.yaml') === -1) {
    // We support only fbp-spec specs
    return;
  }
  const componentName = `${packageId}/${name}`;
  // eslint-disable-next-line no-param-reassign
  loader.specsForComponents[componentName] = specs;
}

/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {Object} module
 * @param {Object} component
 * @param {string} source
 * @param {string} language
 * @param {TranspileCallback} callback
 * @returns {void}
 */
function transpileAndRegisterForModule(loader, module, component, source, language, callback) {
  transpileSource(module.name, component.name, source, language, (transpileError, src) => {
    if (transpileError) {
      callback(transpileError);
      return;
    }
    const moduleBase = path.resolve(loader.baseDir, module.base);
    evaluateModule(moduleBase, module.name, component.name, src, (evalError, implementation) => {
      if (evalError) {
        callback(evalError);
        return;
      }
      registerSources(loader, module.name, component.name, source, language);
      registerSpecs(loader, module.name, component.name, component.tests);
      loader.registerComponent(module.name, component.name, implementation, callback);
    });
  });
}

/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {string} packageId
 * @param {string} name
 * @param {string} source
 * @param {string} language
 * @param {TranspileCallback} callback
 * @returns {void}
 */
export function setSource(loader, packageId, name, source, language, callback) {
  transpileAndRegisterForModule(loader, {
    name: packageId,
    base: '',
  }, {
    name,
  }, source, language, callback);
}

/**
 * @callback SourceCallback
 * @param {Error|null} error
 * @param {Object} [source]
 * @param {string} [source.name]
 * @param {string} [source.library]
 * @param {string} [source.code]
 * @param {string} [source.language]
 * @param {string} [source.tests]
 * @returns {void}
 */
/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {string} name
 * @param {SourceCallback} callback
 * @returns {void}
 */
export function getSource(loader, name, callback) {
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

  /**
   * @param {Error|null} err
   * @param {Object} [src]
   */
  const finalize = (err, src) => {
    if (err) {
      callback(err);
      return;
    }
    if (!loader.specsForComponents) {
      callback(err, src);
      return;
    }
    if (!loader.specsForComponents[componentName]) {
      callback(err, src);
      return;
    }
    const specPath = loader.specsForComponents[componentName];
    fs.readFile(path.resolve(loader.baseDir, specPath), 'utf-8', (fsErr, specs) => {
      if (fsErr) {
        // Ignore spec reading errors
        callback(err, src);
        return;
      }
      callback(err, {
        ...src,
        tests: specs,
      });
    });
  };

  if (loader.isGraph(component)) {
    if (typeof component === 'object') {
      const comp = /** @type import("fbp-graph").Graph */ (component);
      if (typeof comp.toJSON === 'function') {
        finalize(null, {
          name: nameParts[1],
          library: nameParts[0],
          code: JSON.stringify(comp.toJSON()),
          language: 'json',
        });
        return;
      }
      finalize(new Error(`Can't provide source for ${componentName}. Not a file`));
      return;
    }
    if (typeof component === 'string') {
      fbpGraph.graph.loadFile(component, (err, graph) => {
        if (err) {
          finalize(err);
          return;
        }
        if (!graph) {
          finalize(new Error('Unable to load graph'));
          return;
        }
        finalize(null, {
          name: nameParts[1],
          library: nameParts[0],
          code: JSON.stringify(graph.toJSON()),
          language: 'json',
        });
      });
      return;
    }
  }

  if (loader.sourcesForComponents && loader.sourcesForComponents[componentName]) {
    finalize(null, {
      name: nameParts[1],
      library: nameParts[0],
      code: loader.sourcesForComponents[componentName].source,
      language: loader.sourcesForComponents[componentName].language,
    });
    return;
  }

  if (typeof component === 'string') {
    const componentFile = component;
    fs.readFile(componentFile, 'utf-8', (err, code) => {
      if (err) {
        finalize(err);
        return;
      }
      finalize(null, {
        name: nameParts[1],
        library: nameParts[0],
        language: utils.guessLanguageFromFilename(componentFile),
        code,
      });
    });
    return;
  }
  finalize(new Error(`Can't provide source for ${componentName}. Not a file`));
}

/**
 * @returns {Array<string>}
 */
export function getLanguages() {
  const languages = ['javascript', 'es2015'];
  if (CoffeeScript) {
    languages.push('coffeescript');
  }
  if (typescript) {
    languages.push('typescript');
  }
  return languages;
}

/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {Array<string>} componentLoaders
 * @param {ErrorableCallback} callback
 */
function registerCustomLoaders(loader, componentLoaders, callback) {
  componentLoaders.reduce((chain, componentLoader) => chain
    .then(() => new Promise((resolve, reject) => {
      const customLoader = require(componentLoader);
      loader.registerLoader(customLoader, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    })), Promise.resolve())
    .then(() => {
      callback(null);
    }, callback);
}

/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {Array<Object>} modules
 * @param {ErrorableCallback} callback
 */
function registerModules(loader, modules, callback) {
  const compatible = modules.filter((m) => ['noflo', 'noflo-nodejs'].includes(m.runtime));
  const componentLoaders = [];
  Promise.all(compatible.map((m) => {
    if (m.icon) {
      loader.setLibraryIcon(m.name, m.icon);
    }

    if (m.noflo != null ? m.noflo.loader : undefined) {
      const loaderPath = path.resolve(loader.baseDir, m.base, m.noflo.loader);
      componentLoaders.push(loaderPath);
    }

    return Promise.all(m.components.map((c) => new Promise((resolve, reject) => {
      const language = utils.guessLanguageFromFilename(c.path);
      if (language === 'typescript' || language === 'coffeescript') {
        // We can't require a module that requires transpilation, go the setSource route
        fs.readFile(path.resolve(loader.baseDir, c.path), 'utf-8', (fsErr, source) => {
          if (fsErr) {
            reject(fsErr);
            return;
          }
          transpileAndRegisterForModule(loader, m, c, source, language, (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
        return;
      }
      registerSpecs(loader, m.name, c.name, c.tests);
      loader.registerComponent(m.name, c.name, path.resolve(loader.baseDir, c.path), (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    })));
  }))
    .then(
      () => {
        registerCustomLoaders(loader, componentLoaders, callback);
      },
      callback,
    );
}

const dynamicLoader = {
  /**
   * @param {import("../ComponentLoader").ComponentLoader} loader
   * @param {Object} manifestOptions
   * @param {Function} callback
   */
  listComponents(loader, manifestOptions, callback) {
    const opts = manifestOptions;
    opts.discover = true;
    manifest.list.list(loader.baseDir, opts)
      .then((modules) => new Promise((resolve, reject) => {
        registerModules(loader, modules, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(modules);
        });
      }))
      .then((modules) => {
        callback(null, modules);
      }, (err) => {
        callback(err);
      });
  },
};

const manifestLoader = {
  /**
   * @param {import("../ComponentLoader").ComponentLoader} loader
   * @param {import("fbp-manifest/src/lib/list").FbpManifestOptions} options
   * @param {Object} manifestContents
   * @param {Promise<import("fbp-manifest/src/lib/list").FbpManifestDocument>} manifestContents
   * @returns {Promise<import("fbp-manifest/src/lib/list").FbpManifestDocument>}
   */
  writeCache(loader, options, manifestContents) {
    const filePath = path.resolve(loader.baseDir, options.manifest);

    return writeFile(filePath, JSON.stringify(manifestContents, null, 2), {
      encoding: 'utf-8',
    })
      .then(() => manifestContents);
  },

  /**
   * @param {import("../ComponentLoader").ComponentLoader} loader
   * @param {import("fbp-manifest/src/lib/list").FbpManifestOptions} options
   * @returns {Promise<import("fbp-manifest/src/lib/list").FbpManifestDocument>}
   */
  readCache(loader, options) {
    return manifest.load.load(loader.baseDir, {
      ...options,
      discover: false,
    });
  },

  /**
   * @param {import("../ComponentLoader").ComponentLoader} loader
   * @returns {import("fbp-manifest/src/lib/list").FbpManifestOptions}
   */
  prepareManifestOptions(loader) {
    const l = loader;
    if (!l.options) { l.options = {}; }
    const options = {};
    options.runtimes = l.options.runtimes || [];
    if (options.runtimes.indexOf('noflo') === -1) {
      options.runtimes.push('noflo');
    }
    options.recursive = typeof l.options.recursive === 'undefined' ? true : l.options.recursive;
    options.manifest = l.options.manifest || 'fbp.json';
    return options;
  },

  /**
   * @param {import("../ComponentLoader").ComponentLoader} loader
   * @param {Object} manifestOptions
   * @param {Function} callback
   */
  listComponents(loader, manifestOptions, callback) {
    this.readCache(loader, manifestOptions)
      .catch((err) => {
        if (!loader.options.discover) {
          return Promise.reject(err);
        }
        return new Promise((resolve, reject) => {
          dynamicLoader.listComponents(loader, manifestOptions, (err2, modules) => {
            if (err2) {
              reject(err2);
              return;
            }
            resolve(modules);
          });
        })
          .then((modules) => {
            const manifestContents = {
              version: 1,
              modules,
            };
            return this
              .writeCache(loader, manifestOptions, manifestContents)
              .then(() => manifestContents);
          });
      })
      .then((manifestContents) => {
        registerModules(loader, manifestContents.modules, (err) => {
          if (err) {
            callback(err);
            return;
          }
          callback(null, manifestContents.modules);
        });
      })
      .catch((err) => {
        callback(err);
      });
  },
};

/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 */
function registerSubgraph(loader) {
  // Inject subgraph component
  const graphPath = path.resolve(__dirname, '../../components/Graph.js');
  loader.registerComponent(null, 'Graph', graphPath);
}

/**
 * @callback RegistrationCallback
 * @param {Error|null} error
 * @param {Object<string, string>} [modules]
 */
/**
 * @param {import("../ComponentLoader").ComponentLoader} loader
 * @param {RegistrationCallback} callback
 */
export function register(loader, callback) {
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
}

/**
 * @callback ModuleLoadingCallback
 * @param {Error|null} error
 * @param {import("../Component").Component} [instance]
 * @returns {void}
 */

/**
 * @param {string} name
 * @param {string} cPath
 * @param {Object} metadata
 * @param {ModuleLoadingCallback} callback
 */
export function dynamicLoad(name, cPath, metadata, callback) {
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
  if (typeof name === 'string') {
    instance.componentName = name;
  }
  callback(null, instance);
}
