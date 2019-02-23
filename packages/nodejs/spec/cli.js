const { exec } = require('child_process');
const { expect } = require('chai');
const path = require('path');

describe('noflo-nodejs', () => {
  const prog = path.resolve(__dirname, '../bin/noflo-nodejs');
  describe('--graph=helloworld.fbp --batch --trace', () => {
    let stdout = '';
    let stderr = '';
    const graph = path.resolve(__dirname, './fixtures/helloworld.fbp');
    it('should execute graph and exit', (done) => {
      const cmd = `${prog} --graph=${graph} --batch --trace --open=false`;
      exec(cmd, (err, o, e) => {
        if (err) {
          done(err);
          return;
        }
        stdout = o;
        stderr = e;
        done();
      });
    }).timeout(10 * 1000);
    it('should have written the expected output', () => {
      expect(stdout).to.contain('hello world');
    });
    it('should not have written any errors', () => {
      expect(stderr).to.eql('');
    });
    it('should have produced a flowtrace', () => {
      expect(stdout.toLowerCase()).to.include('wrote flowtrace to:');
    });
  });
  describe('--graph=missingcomponent.fbp', () => {
    const graph = path.resolve(__dirname, './fixtures/missingcomponent.fbp');
    it('should fail with an error telling about the missing component', (done) => {
      const cmd = `${prog} --graph=${graph} --open=false`;
      exec(cmd, (err) => {
        expect(err.message).to.contain('Component foo/Bar not available');
        done();
      });
    }).timeout(10 * 1000);
  });
});
