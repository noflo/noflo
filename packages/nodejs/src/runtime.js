const path = require('path');
const fbpGraph = require('fbp-graph');
const { trace } = require('noflo-runtime-base');
const { Runtime: FlowhubRuntime } = require('flowhub-registry');
const debug = require('./debug');
const server = require('./server');
const autoSave = require('./autoSave');

exports.writeTrace = (options, tracer) => new Promise((resolve, reject) => {
  if (!options.trace) {
    resolve(null);
    return;
  }
  tracer.dumpFile(null, (err, filename) => {
    if (err) {
      reject(err);
      return;
    }
    console.log(`Wrote flowtrace to: ${filename}`);
    resolve(null);
  });
});

exports.loadGraph = (options) => new Promise((resolve, reject) => {
  if (typeof options.graph === 'object') {
    // Graph instance provided, return as-is
    resolve(options.graph);
    return;
  }
  fbpGraph.graph.loadFile(options.graph, (err, graph) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(graph);
  });
});

exports.startGraph = (graphPath, runtime, settings) => exports.loadGraph({
  graph: graphPath,
}).then((graphInstance) => new Promise((resolve, reject) => {
  const graph = graphInstance;
  graph.name = graph.name || path.basename(graphPath, path.extname(graphPath));
  graph.baseDir = settings.baseDir;
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
  exports.writeTrace(options, tracer)
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
  const tracer = new trace.Tracer();
  const networks = [];

  process.on('SIGUSR2', () => {
    exports.writeTrace(options, tracer)
      .catch((err) => {
        console.error(err);
      });
  });

  process.on('SIGTERM', () => {
    Promise.all(networks.map(stopNetwork))
      .then(() => exports.writeTrace(options, tracer))
      .then(() => process.exit(0))
      .catch((err) => {
        debug.showError(err);
        process.exit(1);
      });
  });

  if (!options.catchExceptions) {
    process.on('uncaughtException', (err) => {
      debug.showError(err);
      exports.writeTrace(options, tracer)
        .then(() => {
          process.exit(1);
        }, (e) => {
          debug.showError(e);
          process.exit(1);
        });
    });
  }

  rt.network.on('addnetwork', (network) => {
    if (options.trace) {
      tracer.attach(network);
    }
    if (options.debug) {
      debug.add(network, options);
    }
    if (options.batch && options.graph) {
      network.on('end', () => stopRuntime(rt, options, tracer));
    }
    networks.push(network);
  });
  rt.network.on('removenetwork', (network) => {
    if (networks.indexOf(network) === -1) {
      return;
    }
    if (options.trace) {
      exports.writeTrace(options, tracer)
        .then(() => {
          tracer.detach(network);
        });
    }
    networks.splice(networks.indexOf(network), 1);
  });

  if (options.autoSave) {
    autoSave.subscribe(rt);
  }
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
  const flowhubRt = new FlowhubRuntime({
    id: options.id,
    label: options.label,
    protocol: 'websocket',
    address: server.getUrl(options),
    type: 'noflo-nodejs',
  }, {
    host: options.registry,
  });
  doPing(flowhubRt);
  setInterval(() => doPing(flowhubRt), options.registryPing);
  resolve(rt);
});
