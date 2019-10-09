const commander = require('commander');
const uuid = require('uuid/v4');
const generatePassword = require('password-generator');
const os = require('os');
const fs = require('fs');
const path = require('path');
const fbpGraph = require('fbp-graph');
const clone = require('clone');
const nofloNodejs = require('../package.json');
const permissions = require('./permissions');

const config = {
  id: {
    description: 'Unique identifier (UUID) for the runtime',
    env: 'NOFLO_RUNTIME_ID',
    generate: () => uuid(),
  },
  label: {
    description: 'Human-readable label for the runtime',
    generate: (project) => `${project.name} NoFlo runtime`,
  },
  graph: {
    description: 'Path to graph file to run',
    skipSave: true,
  },
  baseDir: {
    cli: 'base-dir',
    env: 'PROJECT_HOME',
    description: 'Project base directory used for component loading',
    default: process.cwd(),
    skipSave: true,
  },
  batch: {
    description: 'Exit program when graph finishes',
    boolean: true,
    skipSave: true,
  },
  host: {
    description: 'Hostname or IP for the runtime. Use "autodetect" for dynamic detection',
    default: 'autodetect',
  },
  port: {
    description: 'Port for the runtime',
    default: 3569,
  },
  tlsKey: {
    cli: 'tls-key',
    description: 'Path to TLS key file',
  },
  tlsCert: {
    cli: 'tls-cert',
    description: 'Path to TLS cert file',
  },
  secret: {
    description: 'Password to be used by FBP protocol clients',
    generate: () => generatePassword(),
  },
  permissions: {
    description: 'Permissions for the FBP protocol clients',
    convert: (val) => val.split(','),
    default: permissions.all(),
  },
  captureOutput: {
    cli: 'capture-output',
    boolean: true,
    description: 'Catch writes to STDOUT and send to FBP protocol client',
    skipSave: true,
  },
  catchExceptions: {
    cli: 'catch-exceptions',
    boolean: true,
    description: 'Catch exceptions and send to FBP protocol client',
    skipSave: true,
  },
  debug: {
    boolean: true,
    description: 'Log NoFlo packet events to STDOUT',
    skipSave: true,
  },
  verbose: {
    boolean: true,
    description: 'Log NoFlo packet contents to STDOUT',
    skipSave: true,
  },
  cache: {
    boolean: true,
    description: 'Enable NoFlo component loader cache',
  },
  trace: {
    boolean: true,
    description: 'Record flowtrace from graph execution',
  },
  ide: {
    description: 'URL for the FBP protocol client',
    default: 'https://app.flowhub.io',
  },
  open: {
    boolean: true,
    description: 'Open the runtime in IDE in user\'s default browser',
    skipSave: true,
    default: true,
  },
  mdns: {
    boolean: true,
    description: 'Advertise runtime via mDNS',
    default: true,
  },
  registryPing: {
    cli: 'registry-ping',
    description: 'How often to ping the runtime registry',
    convert: (val) => parseInt(val, 10),
    default: 10 * 60 * 1000,
  },
  registry: {
    description: 'URL for the runtime registry',
    default: 'https://api.flowhub.io',
  },
  register: {
    boolean: true,
    description: 'Deprecated: Register runtime to runtime registry',
  },
  autoSave: {
    cli: 'auto-save',
    boolean: true,
    description: 'Save edited graphs and components to disk automatically',
    default: false,
  },
};

function discoverIp(preferred) {
  const ifaces = os.networkInterfaces();
  let externalAddress = '';
  let internalAddress = '';

  const findInterface = (connection) => {
    if (connection.family !== 'IPv4') {
      return;
    }
    if (connection.internal) {
      internalAddress = connection.address;
      return;
    }
    externalAddress = connection.address;
  };

  if (typeof preferred === 'string' && ifaces[preferred]) {
    // Only look at the preferred network interface
    ifaces[preferred].forEach(findInterface);
  } else {
    // Cycle through all network interfaces
    Object.keys(ifaces).forEach((iface) => {
      ifaces[iface].forEach(findInterface);
    });
  }

  return externalAddress || internalAddress;
}

const readPackage = (baseDir) => new Promise((resolve, reject) => {
  const packagePath = path.resolve(baseDir, './package.json');
  fs.readFile(packagePath, 'utf8', (err, contents) => {
    if (err) {
      reject(err);
      return;
    }
    try {
      const packageFile = JSON.parse(contents);
      resolve(packageFile);
    } catch (e) {
      reject(e);
    }
  });
});

const applyEnv = () => new Promise((resolve) => {
  const applied = {};
  Object.keys(config).forEach((key) => {
    if (!config[key].env) {
      return;
    }
    if (process.env[config[key].env]) {
      applied[key] = process.env[config[key].env];
    }
  });
  resolve(applied);
});

const parseArguments = () => {
  const options = commander.version(nofloNodejs.version, '-v --version');
  const convertBoolean = (val) => String(val) === 'true';
  Object.keys(config).forEach((key) => {
    const conf = config[key];
    const optionKey = conf.cli || key;
    let { description } = conf;
    if (conf.skipSave) {
      description = `${description} [not saved to flowhub.json]`;
    }
    if (config[key].boolean) {
      options.option(`--${optionKey} [true]`, description, convertBoolean, conf.default);
      return;
    }
    if (config[key].convert) {
      options.option(`--${optionKey} <${optionKey}>`, description, conf.convert, conf.default);
      return;
    }
    options.option(`--${optionKey} <${optionKey}>`, description, conf.default);
  });
  options.parse(process.argv);
  if (typeof options.register !== 'undefined') {
    console.warn('noflo-nodejs --register is deprecated and has no effect');
    delete options.register;
  }
  return options;
};

const applyOptions = (settings, options) => new Promise((resolve) => {
  const applied = clone(settings);
  Object.keys(config).forEach((key) => {
    if (typeof options[key] === 'undefined') {
      return;
    }
    applied[key] = options[key];
  });
  resolve(applied);
});

const applyDefaults = (settings) => new Promise((resolve) => {
  const applied = clone(settings);
  Object.keys(config).forEach((key) => {
    if (typeof config[key].default === 'undefined') {
      return;
    }
    if (typeof applied[key] !== 'undefined') {
      return;
    }
    applied[key] = config[key].default;
  });
  resolve(applied);
});

const applyArguments = (settings) => {
  const options = parseArguments();
  return applyOptions(settings, options);
};

const convertNamespace = (name) => {
  if (!name) {
    return '';
  }
  if (name === 'noflo') {
    return '';
  }
  let cleanedName = name;
  if (cleanedName[0] === '@') {
    cleanedName = cleanedName.replace(/@[a-z-]+\//, '');
  }
  return cleanedName.replace(/^noflo-/, '');
};

const generateValues = (settings) => {
  const applied = clone(settings);
  return readPackage(applied.baseDir)
    .then((packageData) => {
      Object.keys(config).forEach((key) => {
        if (typeof applied[key] !== 'undefined') {
          return;
        }
        if (!config[key].generate) {
          return;
        }
        applied[key] = config[key].generate(packageData, applied);
      });
      // Ensure permissions is in the correct format
      if (Array.isArray(applied.permissions)) {
        if (applied.secret) {
          const perms = {};
          perms[applied.secret] = applied.permissions;
          applied.permissions = perms;
        } else {
          delete applied.permissions;
        }
      }
      if (packageData.repository && packageData.repository.url) {
        applied.repository = packageData.repository.url;
      }
      if (packageData.name) {
        applied.namespace = convertNamespace(packageData.name);
      }
      return applied;
    });
};

const loadSettings = (settings) => new Promise((resolve, reject) => {
  const applied = clone(settings);
  const settingsPath = path.resolve(applied.baseDir, 'flowhub.json');
  fs.readFile(settingsPath, 'utf8', (err, contents) => {
    if (err) {
      // Not having a persisted settings file is OK
      resolve(applied);
      return;
    }
    try {
      const savedSettings = JSON.parse(contents);
      Object.keys(savedSettings).forEach((key) => {
        if (typeof applied[key] !== 'undefined') {
          return;
        }
        if (config[key].skipSave) {
          return;
        }
        applied[key] = savedSettings[key];
      });
      resolve(applied);
    } catch (e) {
      // However, if settings file is corrupted, this is a problem
      reject(e);
    }
  });
});

const saveSettings = (settings) => new Promise((resolve, reject) => {
  const saveables = {};
  Object.keys(config).forEach((key) => {
    if (typeof settings[key] === 'undefined') {
      return;
    }
    if (settings[key] === config[key].default) {
      return;
    }
    if (config[key].skipSave) {
      return;
    }
    saveables[key] = settings[key];
  });
  const settingsPath = path.resolve(settings.baseDir, 'flowhub.json');
  fs.writeFile(settingsPath, JSON.stringify(saveables, null, 2), (err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(settings);
  });
});

// These settings may change for each execution so they're done after saving
const autodetect = (settings) => new Promise((resolve) => {
  const applied = clone(settings);
  if (applied.host === 'autodetect') {
    applied.host = discoverIp();
  }
  if (!applied.graph) {
    const graph = fbpGraph.graph.createGraph('main');
    graph.setProperties({
      environment: {
        type: 'noflo-nodejs',
      },
    });
    applied.graph = graph;
  }
  resolve(applied);
});

// Layered config loading, each level overrides previous
// - Defaults
// - ~/.flowhub.json
// - .flowhub.json
// - env vars
// - CLI arguments
// - Generated, as needed

exports.load = () => applyEnv()
  .then((settings) => applyArguments(settings))
  .then((settings) => loadSettings(settings))
  .then((settings) => generateValues(settings))
  .then((settings) => saveSettings(settings))
  .then((settings) => autodetect(settings));

exports.loadForLibrary = (options) => applyEnv()
  .then((settings) => applyOptions(settings, options))
  .then((settings) => applyDefaults(settings))
  .then((settings) => generateValues(settings))
  .then((settings) => autodetect(settings));
