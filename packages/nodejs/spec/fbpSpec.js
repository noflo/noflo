const { spawn, exec } = require('child_process');
const path = require('path');
const fbpHealthCheck = require('fbp-protocol-healthcheck');

function healthCheck(callback) {
  fbpHealthCheck('ws://localhost:8081')
    .then(() => callback(), () => healthCheck(callback));
}

describe('FBP Spec Compatibility', () => {
  const prog = path.resolve(__dirname, '../bin/noflo-nodejs');
  const tester = path.resolve(__dirname, '../node_modules/.bin/fbp-spec');
  const runtimeSecret = process.env.FBP_PROTOCOL_SECRET || 'noflo-nodejs';
  let progProcess;
  before('start runtime', (done) => {
    progProcess = spawn(prog, [
      '--host=localhost',
      '--port=8081',
      '--open=false',
      `--secret=${runtimeSecret}`,
    ]);
    healthCheck(done);
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
    exec(
      `${tester} --secret ${runtimeSecret} --address ws://localhost:8081 spec/*.yaml`,
      (err, stdout, stderr) => {
        console.log(stdout);
        if (stderr) {
          console.error(stderr);
        }
        done(err);
      },
    );
  }).timeout(60000);
});
