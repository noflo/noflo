let browser;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  browser = false;
} else {
  browser = true;
}

describe('NoFlo interface', () => {
  it('should be able to tell whether it is running on browser', () => {
    chai.expect(noflo.isBrowser()).to.equal(browser);
  });
  describe('working with graph files', () => {
    let targetPath = null;
    before(function () {
      // These features only work on Node.js
      if (noflo.isBrowser()) {
        this.skip();
        return;
      }
      targetPath = path.resolve(__dirname, 'tmp.json');
    });
    after((done) => {
      if (noflo.isBrowser()) {
        done();
        return;
      }
      const fs = require('fs');
      fs.unlink(targetPath, done);
    });
    it('should be able to save a graph file', (done) => {
      const graph = new noflo.Graph();
      graph.addNode('G', 'Graph');
      noflo.saveFile(graph, targetPath, done);
    });
    it('should be able to load a graph file', (done) => {
      noflo.loadFile(targetPath, {
        baseDir: process.cwd(),
        delay: true,
      },
      (err, network) => {
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
