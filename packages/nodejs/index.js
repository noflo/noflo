var fs = require('fs');
var path = require('path');
var os = require('os');

exports.getLibraryConfig = function () {
  var packagePath = path.resolve(__dirname, 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
};

// user settings
exports.getDefaultsPath = function () {
  var homeDir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  return path.resolve(homeDir, '.flowhub.json');
};
exports.getDefaults = function () {
  var defaults = {};
  var defaultsPath = exports.getDefaultsPath();
  if (fs.existsSync(defaultsPath)) {
    var storedDefaults = JSON.parse(fs.readFileSync(defaultsPath));
    for (var name in storedDefaults) {
      defaults[name] = storedDefaults[name];
    }
  }
  if (!defaults.user && process.env.FLOWHUB_USER_ID) {
    defaults.user = process.env.FLOWHUB_USER_ID;
  }
  if (!defaults.port) {
    defaults.port = 3569;
  }
  if (!defaults.host) {
    defaults.host = 'autodetect';
  }
  return defaults;
};
exports.saveDefaults = function (values) {
  var defaultsPath = exports.getDefaultsPath();
  fs.writeFileSync(defaultsPath, JSON.stringify(values, null, 2), 'utf-8');
};

// flowhub registration
exports.getStoredPath = function () {
  var root = process.env.PROJECT_HOME || process.cwd();
  return path.resolve(root, 'flowhub.json');
};
exports.getStored = function () {
  var stored = {};
  var storedPath = exports.getStoredPath();
  if (fs.existsSync(storedPath)) {
    stored = JSON.parse(fs.readFileSync(storedPath));
  }

  if (!stored.host || stored.host === 'autodetect') {
    stored.host = exports.discoverHost();
  }
  if (process.env.PORT) {
    stored.port = process.env.PORT;
  }
  if (!stored.port) {
    stored.port = 3569;
  }

  return stored;
};
exports.saveStored = function (values) {
  var storedPath = exports.getStoredPath();
  fs.writeFileSync(storedPath, JSON.stringify(values, null, 2), 'utf-8');
};
exports.discoverHost = function () {
  var ifaces = os.networkInterfaces();
  var address, int_address;
  
  var filter = function (connection) {
    if (connection.family !== 'IPv4') {
      return;
    }
    if (connection.internal) {
      int_address = connection.address;
    } else {
      address = connection.address;
    }
  };
  
  for (var device in ifaces) {
    ifaces[device].forEach(filter);
  }
  return address || int_address;
};
