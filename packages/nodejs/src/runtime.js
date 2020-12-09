const path = require('path');
const fbpGraph = require('fbp-graph');
const { Runtime: FlowhubRuntime } = require('flowhub-registry');
const os = require('os');
const mdns = require('mdns-js');
const debug = require('./debug');
const server = require('./server');
const autoSave = require('./autoSave');
const { writeTrace } = require('./trace');

exports.loadGraph = (options) => {
  if (typeof options.graph === 'object') {
    // Graph instance provided, return as-is
    return Promise.resolve(options.graph);
  }
  return fbpGraph.graph.loadFile(options.graph);
};

exports.startGraph = (graphPath, runtime, settings) => exports.loadGraph({
  graph: graphPath,
}).then((graphInstance) => new Promise((resolve, reject) => {
  const graph = graphInstance;
  graph.name = graph.name || path.basename(graphPath, path.extname(graphPath));
  const graphName = `${settings.namespace}/${graph.name}`;
  runtime.graph.registerGraph(graphName, graph);
  runtime.network._startNetwork(graph, graphName, 'none', (err) => { // eslint-disable-line
    if (err) {
      reject(err);
      return;
    }
    runtime.runtime.setMainGraph(graphName);
    resolve(runtime);
  });
}));

function stopNetwork(network) {
  return new Promise((resolve, reject) => {
    network.stop((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(network);
    });
  });
}

function stopRuntime(rt, options, tracer) {
  writeTrace(options, tracer)
    .then(() => server.stop(rt))
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

exports.subscribe = (rt, options) => new Promise((resolve) => {
  const networks = [];
  const tracers = [];

  process.on('SIGUSR2', () => {
    Promise.all(tracers.map((tracer) => writeTrace(options, tracer)))
      .catch((err) => {
        console.error(err);
      });
  });

  process.on('SIGTERM', () => {
    Promise.all(networks.map(stopNetwork))
      .then(() => Promise.all(tracers.map((tracer) => writeTrace(options, tracer))))
      .then(() => process.exit(0))
      .catch((err) => {
        debug.showError(err);
        process.exit(1);
      });
  });

  if (!options.catchExceptions) {
    process.on('uncaughtException', (err) => {
      debug.showError(err);
      Promise.all(tracers.map((tracer) => writeTrace(options, tracer)))
        .then(() => {
          process.exit(1);
        }, (e) => {
          debug.showError(e);
          process.exit(1);
        });
    });
  }

  rt.network.on('addnetwork', (network, graphName) => {
    let tracer;
    if (options.trace) {
      tracer = rt.trace.startTrace(graphName, network);
    }
    if (options.debug) {
      debug.add(network, options);
    }
    if (options.batch && options.graph) {
      network.on('end', () => stopRuntime(rt, options, tracer));
    }
    networks.push(network);
  });
  rt.network.on('removenetwork', (network, graphName) => {
    if (networks.indexOf(network) === -1) {
      return;
    }
    if (options.trace && rt.trace.traces[graphName]) {
      writeTrace(options, rt.trace.traces[graphName]);
    }
    networks.splice(networks.indexOf(network), 1);
  });

  if (options.autoSave) {
    autoSave.subscribe(rt);
  }
  resolve(rt);
});

function getDefinition(options) {
  return {
    id: options.id,
    label: options.label || options.host,
    protocol: 'websocket',
    type: 'noflo-nodejs',
  };
}

exports.advertiseMdns = (rt, options) => new Promise((resolve) => {
  if (!options.mdns) {
    resolve(rt);
    return;
  }
  const definition = getDefinition(options);
  const service = mdns.createAdvertisement(mdns.tcp('_fbp-ws'), options.port, {
    name: os.hostname().split('.').shift(),
    txt: {
      txtvers: '1',
      ...definition,
    },
  });
  service.start();
  resolve(rt);
});

function doPing(flowhubRt) {
  flowhubRt.ping(() => {});
}

exports.ping = (rt, options) => new Promise((resolve) => {
  if (!options.id || !options.registryPing) {
    resolve(rt);
    return;
  }
  const definition = getDefinition(options);
  const flowhubRt = new FlowhubRuntime({
    address: server.getUrl(options),
    ...definition,
  }, {
    host: options.registry,
  });
  doPing(flowhubRt);
  setInterval(() => doPing(flowhubRt), options.registryPing);
  resolve(rt);
});
