var fs = require('fs');
var path = require('path');

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
  return path.resolve(process.cwd(), 'flowhub.json');
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
