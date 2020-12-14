const fs = require('fs');
const { promisify } = require('util');
const { resolve } = require('path');
const slug = require('slug');

const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

function ensureTracedir(options) {
  if (!options.trace) {
    return Promise.resolve();
  }
  const tracePath = resolve(options.baseDir, './.flowtrace');
  return stat(tracePath)
    .catch(() => mkdir(tracePath, {
      recursive: true,
    })
      .then(() => stat(tracePath)))
    .then((stats) => {
      if (!stats.isDirectory()) {
        return Promise.reject(new Error(`${tracePath} is not a directory`));
      }
      return Promise.resolve(tracePath);
    });
}

function writeTrace(options, tracer) {
  if (!options.trace) {
    return Promise.resolve();
  }
  const date = new Date().toISOString().substr(0, 10);
  const fileName = slug(`${date}-noflo-nodejs-${options.id}-${tracer.mainGraph}`);
  return ensureTracedir(options)
    .then((traceDir) => {
      const tracePath = resolve(traceDir, `./${fileName}.json`);
      return writeFile(tracePath, JSON.stringify(tracer, null, 2))
        .then(() => tracePath);
    })
    .then((filename) => {
      console.log(`Wrote flowtrace to: ${filename}`);
      return null;
    });
}

module.exports = {
  ensureTracedir,
  writeTrace,
};
