const { spawn, exec } = require('child_process');
const path = require('path');

describe('FBP Protocol Compatibility', () => {
  const prog = path.resolve(__dirname, '../bin/noflo-nodejs');
  const tester = path.resolve(__dirname, '../node_modules/.bin/fbp-test --colors');
  const runtimeSecret = process.env.FBP_PROTOCOL_SECRET || 'noflo-nodejs';
  let progProcess;
  before('start runtime', (done) => {
    progProcess = spawn(prog, [
      '--host=localhost',
      '--port=8080',
      '--open=false',
      `--secret=${runtimeSecret}`,
    ]);
    done();
  });
  after('stop runtime', (done) => {
    if (!progProcess) {
      done();
      return;
    }
    process.kill(progProcess.pid);
    done();
  });
  it('should pass the test suite', (done) => {
    exec(tester, {
      env: {
        ...process.env,
        FBP_PROTOCOL_SECRET: runtimeSecret,
      },
    }, (err, stdout, stderr) => {
      console.log(stdout);
      console.error(stderr);
      done(err);
    });
  }).timeout(60000);
});
