const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

function ensureDir(dirName, rt) {
  const directoryPath = path.resolve(rt.options.baseDir, `./${dirName}`);
  return stat(directoryPath)
    .catch(() => mkdir(directoryPath, {
      recursive: true,
    })
      .then(() => stat(directoryPath)))
    .then((stats) => {
      if (!stats.isDirectory()) {
        return Promise.reject(new Error(`${directoryPath} is not a directory`));
      }
      return Promise.resolve(directoryPath);
    });
}

function getComponentName(component, directoryPath) {
  return new Promise((resolve, reject) => {
    let suffix;
    switch (component.language) {
      case 'coffeescript':
        suffix = 'coffee';
        break;
      case 'javascript':
      case 'es2015':
        suffix = 'js';
        break;
      default:
        reject(new Error(`Unsupported component language ${component.language}`));
    }
    resolve(path.resolve(directoryPath, `${component.name}.${suffix}`));
  });
}

function fileDisplayPath(filePath, rt) {
  return path.relative(rt.options.baseDir, filePath);
}

function saveComponent(component, rt) {
  if (component.library !== rt.options.namespace) {
    // Skip saving components outside of project namespace
    return Promise.resolve();
  }
  return ensureDir('components', rt)
    .then(directoryPath => getComponentName(component, directoryPath))
    .then(filePath => writeFile(filePath, component.code)
      .then(() => {
        console.log(`Saved ${fileDisplayPath(filePath, rt)}`);
      }));
}

exports.subscribe = (rt) => {
  if (typeof rt.component.on !== 'function' || typeof rt.graph.on !== 'function') {
    console.log('Skipping auto-save due to noflo-runtime-base being too old');
    return;
  }

  rt.component.on('updated', (component) => {
    saveComponent(component, rt)
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  });
};
