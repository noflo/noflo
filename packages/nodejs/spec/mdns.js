const path = require('path');
const mdns = require('mdns-js');
const { v4: uuid } = require('uuid');
const fbpHealthCheck = require('fbp-protocol-healthcheck');
const { expect } = require('chai');
const library = require('../src/library');
const server = require('../src/server');

describe('noflo-nodejs mDNS discovery', () => {
  let rt;
  let browser;
  before('prepare mDNS', (done) => {
    browser = mdns.createBrowser();
    browser.on('ready', () => {
      done();
    });
  });
  after('stop mDNS', () => {
    browser.stop();
  });
  after('stop the runtime', () => server.stop(rt));
  it('should be able to start a fixture project', () => library(
    path.resolve(__dirname, './fixtures/library/graphs/main.fbp'),
    {
      id: uuid(),
      host: 'localhost',
      port: 3571,
      secret: 'foo',
      baseDir: path.resolve(__dirname, './fixtures/library'),
      mdns: true,
    },
  )
    .then((runtime) => {
      rt = runtime;
    }));
  it('should have started a WebSocket runtime', () => fbpHealthCheck(
    'ws://localhost:3571',
  ));
  it('should be discoverable via mDNS', (done) => {
    browser.discover();
    browser.on('update', (data) => {
      if (!data.fullname || data.fullname.indexOf('fbp-ws') === -1) {
        // Unrelated service
        return;
      }
      expect(data.txt).to.include('type=noflo-nodejs');
      expect(data.txt).to.include(`id=${rt.options.id}`);
      done();
    });
  });
});
