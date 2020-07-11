let browser, chai, noflo, path;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { chai = require('chai'); }
  noflo = require('../src/lib/NoFlo');
  path = require('path');
  browser = false;
} else {
  noflo = require('noflo');
  browser = true;
}

describe('NoFlo interface', function() {
  it('should be able to tell whether it is running on browser', function() {
    chai.expect(noflo.isBrowser()).to.equal(browser);
  });
  describe('working with graph files', function() {
    let targetPath = null;
    before(function() {
      // These features only work on Node.js
      if (noflo.isBrowser()) {
        this.skip();
        return;
      }
      targetPath = path.resolve(__dirname, 'tmp.json');
    });
    after(function(done) {
      if (noflo.isBrowser()) {
        done();
        return;
      }
      const fs = require('fs');
      fs.unlink(targetPath, done);
    });
    it('should be able to save a graph file', function(done) {
      const graph = new noflo.Graph;
      graph.addNode('G', 'Graph');
      noflo.saveFile(graph, targetPath, done);
    });
    it('should be able to load a graph file', function(done) {
      noflo.loadFile(targetPath, {
        baseDir: process.cwd(),
        delay: true
      }
      , function(err, network) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(network.isRunning()).to.equal(false);
        done();
      });
    });
  });
});
