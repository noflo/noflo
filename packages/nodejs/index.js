var fs = require('fs');
var path = require('path');
var os = require('os');

exports.getLibraryConfig = function () {
  var packagePath = path.resolve(__dirname, 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
};

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
  return defaults;
};
exports.saveDefaults = function (values) {
  var defaultsPath = exports.getDefaultsPath();
  fs.writeFileSync(defaultsPath, JSON.stringify(values, null, 2), 'utf-8');
};
exports.getStoredPath = function () {
  var root = process.env.PROJECT_HOME || process.cwd();
  return path.resolve(root, 'flowhub.json');
};
exports.getStored = function () {
  var storedPath = exports.getStoredPath();
  if (fs.existsSync(storedPath)) {
    return JSON.parse(fs.readFileSync(storedPath));
  }
  return {};
};
exports.saveStored = function (values) {
  var storedPath = exports.getStoredPath();
  fs.writeFileSync(storedPath, JSON.stringify(values, null, 2), 'utf-8');
};
exports.discoverHost = function () {
  var ifaces = os.networkInterfaces();
  var address;
  for (var device in ifaces) {
    ifaces[device].forEach(function (connection) {
      if (connection.family !== 'IPv4') {
        return;
      }
      address = connection.address;
    });
  }
  return address;
};
