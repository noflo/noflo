import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import path from 'node:path';
import * as noflo from '../src/lib/NoFlo.js';

let browser;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  browser = false;
} else {
  browser = true;
}

describe('NoFlo interface', () => {
  it('should be able to tell whether it is running on browser', () => {
    assert.equal(noflo.isBrowser(), browser);
  });
  describe('working with graph files', () => {
    let targetPath = null;
    before(() => {
      // These features only work on Node.js
      if (noflo.isBrowser()) {
        this.skip();
        return;
      }
      targetPath = path.resolve(import.meta.dirname, 'tmp.json');
    });
    after(() => {
      if (noflo.isBrowser()) {
        return Promise.resolve();
      }
      return import('node:fs/promises')
        .then(({ unlink }) => {
          return unlink(targetPath);
        });
    });
    it('should be able to save a graph file', () => {
      const graph = new noflo.Graph();
      graph.addNode('G', 'Graph');
      return noflo.saveFile(graph, targetPath);
    });
    it('should be able to load a graph file', () => {
      return noflo.loadFile(targetPath, {
        baseDir: process.cwd(),
        delay: true,
      })
        .then((network) => {
          assert.equal(network.isRunning(), false);
        });
    });
  });
});
