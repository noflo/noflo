//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    class-methods-use-this,
    import/no-unresolved,
*/

const noflo = require('../lib/NoFlo');

// The Graph component is used to wrap NoFlo Networks into components inside
// another network.
class Graph extends noflo.Component {
  constructor(metadata) {
    super();
    this.metadata = metadata;
    this.network = null;
    this.ready = true;
    this.started = false;
    this.starting = false;
    this.baseDir = null;
    this.loader = null;
    this.load = 0;

    this.inPorts = new noflo.InPorts({
      graph: {
        datatype: 'all',
        description: 'NoFlo graph definition to be used with the subgraph component',
        required: true,
      },
    });
    this.outPorts = new noflo.OutPorts();

    this.inPorts.ports.graph.on('ip', (packet) => {
      if (packet.type !== 'data') { return; }
      this.setGraph(packet.data, (err) => {
        // TODO: Port this part to Process API and use output.error method instead
        if (err) {
          this.error(err);
        }
      });
    });
  }

  setGraph(graph, callback) {
    this.ready = false;
    if (typeof graph === 'object') {
      if (typeof graph.addNode === 'function') {
        // Existing Graph object
        this.createNetwork(graph, callback);
        return;
      }

      // JSON definition of a graph
      noflo.graph.loadJSON(graph, (err, instance) => {
        const inst = instance;
        if (err) {
          callback(err);
          return;
        }
        inst.properties.baseDir = this.baseDir;
        this.createNetwork(inst, callback);
      });
      return;
    }

    let graphName = graph;

    if ((graphName.substr(0, 1) !== '/') && (graphName.substr(1, 1) !== ':') && process && process.cwd) {
      graphName = `${process.cwd()}/${graphName}`;
    }

    noflo.graph.loadFile(graphName, (err, instance) => {
      const inst = instance;
      if (err) {
        callback(err);
        return;
      }
      inst.properties.baseDir = this.baseDir;
      this.createNetwork(inst, callback);
    });
  }

  createNetwork(graph, callback) {
    this.description = graph.properties.description || '';
    this.icon = graph.properties.icon || this.icon;

    const graphObj = graph;
    if (!graphObj.name) { graphObj.name = this.nodeId; }
    graphObj.componentLoader = this.loader;

    noflo.createNetwork(graphObj, {
      delay: true,
      subscribeGraph: false,
    },
    (err, network) => {
      this.network = network;
      if (err) {
        callback(err);
        return;
      }
      this.emit('network', this.network);
      // Subscribe to network lifecycle
      this.subscribeNetwork(this.network);

      // Wire the network up
      this.network.connect((err2) => {
        if (err2) {
          callback(err2);
          return;
        }
        Object.keys(this.network.processes).forEach((name) => {
          // Map exported ports to local component
          const node = this.network.processes[name];
          this.findEdgePorts(name, node);
        });
        // Finally set ourselves as "ready"
        this.setToReady();
        callback();
      });
    });
  }

  subscribeNetwork(network) {
    const contexts = [];
    network.on('start', () => {
      const ctx = {};
      contexts.push(ctx);
      this.activate(ctx);
    });
    network.on('end', () => {
      const ctx = contexts.pop();
      if (!ctx) { return; }
      this.deactivate(ctx);
    });
  }

  isExportedInport(port, nodeName, portName) {
    // First we check disambiguated exported ports
    const keys = Object.keys(this.network.graph.inports);
    for (let i = 0; i < keys.length; i += 1) {
      const pub = keys[i];
      const priv = this.network.graph.inports[pub];
      if (priv.process === nodeName && priv.port === portName) {
        return pub;
      }
    }

    // Component has exported ports and this isn't one of them
    return false;
  }

  isExportedOutport(port, nodeName, portName) {
    // First we check disambiguated exported ports
    const keys = Object.keys(this.network.graph.outports);
    for (let i = 0; i < keys.length; i += 1) {
      const pub = keys[i];
      const priv = this.network.graph.outports[pub];
      if (priv.process === nodeName && priv.port === portName) {
        return pub;
      }
    }

    // Component has exported ports and this isn't one of them
    return false;
  }

  setToReady() {
    if ((typeof process !== 'undefined') && process.execPath && (process.execPath.indexOf('node') !== -1)) {
      process.nextTick(() => {
        this.ready = true;
        return this.emit('ready');
      });
    } else {
      setTimeout(() => {
        this.ready = true;
        return this.emit('ready');
      },
      0);
    }
  }

  findEdgePorts(name, process) {
    const inPorts = process.component.inPorts.ports;
    const outPorts = process.component.outPorts.ports;

    Object.keys(inPorts).forEach((portName) => {
      const port = inPorts[portName];
      const targetPortName = this.isExportedInport(port, name, portName);
      if (targetPortName === false) { return; }
      this.inPorts.add(targetPortName, port);
      this.inPorts[targetPortName].on('connect', () => {
        // Start the network implicitly if we're starting to get data
        if (this.starting) { return; }
        if (this.network.isStarted()) { return; }
        if (this.network.startupDate) {
          // Network was started, but did finish. Re-start simply
          this.network.setStarted(true);
          return;
        }
        // Network was never started, start properly
        this.setUp(() => {});
      });
    });

    Object.keys(outPorts).forEach((portName) => {
      const port = outPorts[portName];
      const targetPortName = this.isExportedOutport(port, name, portName);
      if (targetPortName === false) { return; }
      this.outPorts.add(targetPortName, port);
    });

    return true;
  }

  isReady() {
    return this.ready;
  }

  isSubgraph() {
    return true;
  }

  isLegacy() {
    return false;
  }

  setUp(callback) {
    this.starting = true;
    if (!this.isReady()) {
      this.once('ready', () => {
        this.setUp(callback);
      });
      return;
    }
    if (!this.network) {
      callback(null);
      return;
    }
    this.network.start((err) => {
      if (err) {
        callback(err);
        return;
      }
      this.starting = false;
      callback();
    });
  }

  tearDown(callback) {
    this.starting = false;
    if (!this.network) {
      callback(null);
      return;
    }
    this.network.stop((err) => {
      if (err) {
        callback(err);
        return;
      }
      callback();
    });
  }
}

exports.getComponent = (metadata) => new Graph(metadata);
