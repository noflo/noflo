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

function getComponentPath(component, directoryPath) {
  const componentName = path.basename(component.name);
  return new Promise((resolve, reject) => {
    let suffix;
    switch (component.language) {
      case 'yaml':
        suffix = 'yaml';
        break;
      case 'coffeescript':
        suffix = 'coffee';
        break;
      case 'typescript':
        suffix = 'ts';
        break;
      case 'javascript':
      case 'es2015':
        suffix = 'js';
        break;
      default:
        reject(new Error(`Unsupported component language ${component.language}`));
    }
    resolve(path.resolve(directoryPath, `${componentName}.${suffix}`));
  });
}

function getGraphPath(name, graph, directoryPath) {
  const graphName = path.basename(name);
  return Promise.resolve(path.resolve(directoryPath, `${graphName}.json`));
}

function fileDisplayPath(filePath, rt) {
  return path.relative(rt.options.baseDir, filePath);
}

function saveSpec(component, rt) {
  if (!component.tests) {
    return Promise.resolve();
  }
  // Default assumption is that specs are in the same language as the source
  let { language } = component;
  if (component.tests.indexOf('topic: ') !== -1 && component.tests.indexOf('cases:') !== -1) {
    // Reasonable guess is that this is an fbp-spec file.
    // Should probably try parsing YAML to be sure.
    language = 'yaml';
  }
  return ensureDir('spec', rt)
    .then((directoryPath) => getComponentPath({
      ...component,
      language,
    }, directoryPath))
    .then((filePath) => writeFile(filePath, component.tests)
      .then(() => {
        console.log(`Saved ${fileDisplayPath(filePath, rt)}`);
      }));
}

function saveComponent(component, rt) {
  if (component.library !== rt.options.namespace) {
    // Skip saving components outside of project namespace
    return Promise.resolve();
  }
  return ensureDir('components', rt)
    .then((directoryPath) => getComponentPath(component, directoryPath))
    .then((filePath) => writeFile(filePath, component.code)
      .then(() => {
        console.log(`Saved ${fileDisplayPath(filePath, rt)}`);
        return saveSpec(component, rt);
      }));
}

function saveGraph(name, graph, rt) {
  if (graph.properties.id && graph.properties.id.indexOf('fixture.') === 0) {
    // fbp-spec graph, should not be saved
    return Promise.resolve();
  }
  if (graph.properties.library && graph.properties.library !== rt.options.namespace) {
    // Skip saving graphs outside of project namespace
    return Promise.resolve();
  }
  return ensureDir('graphs', rt)
    .then((directoryPath) => getGraphPath(name, graph, directoryPath))
    .then((filePath) => {
      const graphJSON = graph.toJSON();
      if (name && graphJSON.properties) {
        graphJSON.properties.name = path.basename(name);
      }
      return writeFile(filePath, JSON.stringify(graphJSON, null, 4))
        .then(() => {
          console.log(`Saved ${fileDisplayPath(filePath, rt)}`);
        });
    });
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
  rt.graph.on('updated', ({ name, graph }) => {
    saveGraph(name, graph, rt)
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  });
};
