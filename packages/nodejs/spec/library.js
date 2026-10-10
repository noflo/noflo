const path = require('path');
const fbpHealthCheck = require('fbp-protocol-healthcheck');
const fbpClient = require('fbp-client');
const { expect } = require('chai');
const library = require('../src/library');
const server = require('../src/server');

describe('noflo-nodejs as library', () => {
  let rt;
  let rtClient;
  after('stop the runtime', () => rtClient.disconnect()
    .then(() => server.stop(rt)));
  it('should be able to start a fixture project', () => library(
    path.resolve(__dirname, './fixtures/library/graphs/main.fbp'),
    {
      hostname: 'localhost',
      port: 3571,
      secret: 'foo',
      baseDir: path.resolve(__dirname, './fixtures/library'),
    },
  )
    .then((runtime) => {
      rt = runtime;
    }));
  it('should have started a WebSocket runtime', () => fbpHealthCheck(
    'ws://localhost:3571',
  ));
  it('should be possible to connect to the runtime', () => fbpClient({
    address: 'ws://localhost:3571',
    protocol: 'websocket',
    secret: 'foo',
  })
    .then((c) => {
      rtClient = c;
      return c.connect();
    }));
  it('runtime should have declared its main graph', () => {
    expect(rtClient.definition.graph).to.equal('library/main');
  });
  it('should return graph sources when requested', () => rtClient
    .protocol.component.getsource({
      name: rtClient.definition.graph,
    }));
  it('should return network status when requested', () => rtClient
    .protocol.network.getstatus({
      graph: rtClient.definition.graph,
    }));
});
