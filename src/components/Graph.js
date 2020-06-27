/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
//
// The Graph component is used to wrap NoFlo Networks into components inside
// another network.
const noflo = require("../lib/NoFlo");

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
        required: true
      }
    });
    this.outPorts = new noflo.OutPorts;

    this.inPorts.graph.on('ip', packet => {
      if (packet.type !== 'data') { return; }
      return this.setGraph(packet.data, err => {
        // TODO: Port this part to Process API and use output.error method instead
        if (err) {
          return this.error(err);
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
        if (err) {
          callback(err);
          return;
        }
        instance.baseDir = this.baseDir;
        this.createNetwork(instance, callback);
      });
      return;
    }

    if ((graph.substr(0, 1) !== "/") && (graph.substr(1, 1) !== ":") && process && process.cwd) {
      graph = `${process.cwd()}/${graph}`;
    }

    noflo.graph.loadFile(graph, (err, instance) => {
      if (err) {
        callback(err);
        return;
      }
      instance.baseDir = this.baseDir;
      this.createNetwork(instance, callback);
    });
  }

  createNetwork(graph, callback) {
    this.description = graph.properties.description || '';
    this.icon = graph.properties.icon || this.icon;

    if (!graph.name) { graph.name = this.nodeId; }
    graph.componentLoader = this.loader;

    noflo.createNetwork(graph, {
      delay: true,
      subscribeGraph: false
    }
    , (err, network) => {
      this.network = network;
      if (err) {
        callback(err);
        return;
      }
      this.emit('network', this.network);
      // Subscribe to network lifecycle
      this.subscribeNetwork(this.network);

      // Wire the network up
      this.network.connect(err => {
        if (err) {
          callback(err);
          return;
        }
        for (let name in this.network.processes) {
          // Map exported ports to local component
          const node = this.network.processes[name];
          this.findEdgePorts(name, node);
        }
        // Finally set ourselves as "ready"
        (this.setToReady)();
        callback();
      });
    });
  }

  subscribeNetwork(network) {
    const contexts = [];
    this.network.on('start', () => {
      const ctx = {};
      contexts.push(ctx);
      return this.activate(ctx);
    });
    return this.network.on('end', () => {
      const ctx = contexts.pop();
      if (!ctx) { return; }
      this.deactivate(ctx);
    });
  }

  isExportedInport(port, nodeName, portName) {
    // First we check disambiguated exported ports
    for (let pub in this.network.graph.inports) {
      const priv = this.network.graph.inports[pub];
      if ((priv.process !== nodeName) || (priv.port !== portName)) { continue; }
      return pub;
    }

    // Component has exported ports and this isn't one of them
    return false;
  }

  isExportedOutport(port, nodeName, portName) {
    // First we check disambiguated exported ports
    for (let pub in this.network.graph.outports) {
      const priv = this.network.graph.outports[pub];
      if ((priv.process !== nodeName) || (priv.port !== portName)) { continue; }
      return pub;
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
      }
      , 0);
    }
  }

  findEdgePorts(name, process) {
    let port, portName, targetPortName;
    const inPorts = process.component.inPorts.ports;
    const outPorts = process.component.outPorts.ports;

    for (portName in inPorts) {
      port = inPorts[portName];
      targetPortName = this.isExportedInport(port, name, portName);
      if (targetPortName === false) { continue; }
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
        this.setUp(function() {});
      });
    }

    for (portName in outPorts) {
      port = outPorts[portName];
      targetPortName = this.isExportedOutport(port, name, portName);
      if (targetPortName === false) { continue; }
      this.outPorts.add(targetPortName, port);
    }

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
    this.network.start(err => {
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
    if (!this.network) { return callback(null); }
    this.network.stop(function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback();
    });
  }
}

exports.getComponent = metadata => new Graph(metadata);
