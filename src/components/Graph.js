//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    class-methods-use-this,
    import/no-unresolved,
    import/prefer-default-export,
*/

import * as noflo from '../lib/NoFlo';

// The Graph component is used to wrap NoFlo Networks into components inside
// another network.
export class Graph extends noflo.Component {
  /**
   * @param {import("fbp-graph/lib/Types").GraphNodeMetadata} [metadata]
   */
  constructor(metadata) {
    super();
    this.metadata = metadata;
    /** @type {import("../lib/Network").Network|null} */
    this.network = null;
    this.ready = true;
    this.started = false;
    this.starting = false;
    /** @type {string|null} */
    this.baseDir = null;
    /** @type {noflo.ComponentLoader|null} */
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
      // TODO: Port this part to Process API and use output.error method instead
      this.setGraph(packet.data).catch(this.error);
    });
  }

  /**
   * @param {import("fbp-graph").Graph|string} graph
   * @returns {Promise<void>}
   */
  setGraph(graph) {
    this.ready = false;
    if (typeof graph === 'object') {
      if (typeof graph.addNode === 'function') {
        // Existing Graph object
        return this.createNetwork(graph);
      }
      // JSON definition of a graph
      return noflo.graph.loadJSON(graph)
        .then((instance) => this.createNetwork(instance));
    }
    let graphName = graph;
    if ((graphName.substr(0, 1) !== '/') && (graphName.substr(1, 1) !== ':') && process && process.cwd) {
      graphName = `${process.cwd()}/${graphName}`;
    }
    return noflo.graph.loadFile(graphName)
      .then((instance) => this.createNetwork(instance));
  }

  /**
   * @param {import("fbp-graph").Graph} graph
   * @returns {Promise<void>}
   */
  createNetwork(graph) {
    this.description = graph.properties.description || '';
    this.icon = graph.properties.icon || this.icon;

    const graphObj = graph;
    if (!graphObj.name && this.nodeId) {
      graphObj.name = this.nodeId;
    }

    return noflo.createNetwork(graphObj, {
      delay: true,
      subscribeGraph: false,
      componentLoader: this.loader || undefined,
      baseDir: this.baseDir || undefined,
    })
      .then((network) => {
        this.network = /** @type {import("../lib/Network").Network} */ (network);
        this.emit('network', network);
        // Subscribe to network lifecycle
        this.subscribeNetwork(this.network);
        // Wire the network up
        return network.connect();
      })
      .then((network) => {
        Object.keys(network.processes).forEach((name) => {
          // Map exported ports to local component
          const node = network.processes[name];
          this.findEdgePorts(name, node);
        });
        // Finally set ourselves as "ready"
        this.setToReady();
      });
  }

  /**
   * @typedef SubgraphContext
   * @property {boolean} activated
   * @property {boolean} deactivated
   */

  /**
   * @param {import("../lib/Network").Network} network
   */
  subscribeNetwork(network) {
    /**
     * @type {Array<SubgraphContext>}
     */
    const contexts = [];
    network.on('start', () => {
      const ctx = {
        activated: false,
        deactivated: false,
        result: {},
      };
      contexts.push(ctx);
      this.activate(ctx);
    });
    network.on('end', () => {
      const ctx = contexts.pop();
      if (!ctx) { return; }
      this.deactivate(ctx);
    });
  }

  /**
   * @param {import("../lib/InPort").default} port
   * @param {string} nodeName
   * @param {string} portName
   * @returns {boolean|string}
   */
  isExportedInport(port, nodeName, portName) {
    if (!this.network) {
      return false;
    }
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

  /**
   * @param {import("../lib/OutPort").default} port
   * @param {string} nodeName
   * @param {string} portName
   * @returns {boolean|string}
   */
  isExportedOutport(port, nodeName, portName) {
    if (!this.network) {
      return false;
    }
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

  /**
   * @param {string} name
   * @param {import("../lib/BaseNetwork").NetworkProcess} process
   * @returns {boolean}
   */
  findEdgePorts(name, process) {
    if (!process.component) {
      return false;
    }
    const inPorts = process.component.inPorts.ports;
    const outPorts = process.component.outPorts.ports;

    Object.keys(inPorts).forEach((portName) => {
      const port = inPorts[portName];
      const targetPortName = this.isExportedInport(port, name, portName);
      if (typeof targetPortName !== 'string') { return; }
      this.inPorts.add(targetPortName, port);
      this.inPorts.ports[targetPortName].on('connect', () => {
        // Start the network implicitly if we're starting to get data
        if (this.starting || !this.network) { return; }
        if (this.network.isStarted()) { return; }
        if (this.network.startupDate) {
          // Network was started, but did finish. Re-start simply
          this.network.setStarted(true);
          return;
        }
        // Network was never started, start properly
        this.setUp();
      });
    });

    Object.keys(outPorts).forEach((portName) => {
      const port = outPorts[portName];
      const targetPortName = this.isExportedOutport(port, name, portName);
      if (typeof targetPortName !== 'string') { return; }
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

  setUp() {
    this.starting = true;
    if (!this.isReady()) {
      return new Promise((resolve, reject) => {
        this.once('ready', () => {
          this.setUp().then(resolve, reject);
        });
      });
    }
    if (!this.network) {
      return Promise.resolve();
    }
    return this.network.start()
      .then(() => {
        this.starting = false;
      });
  }

  tearDown() {
    this.starting = false;
    if (!this.network) {
      return Promise.resolve();
    }
    return this.network.stop()
      .then(() => {});
  }
}

/**
 * @param {import("fbp-graph/lib/Types").GraphNodeMetadata} [metadata]
 */
export function getComponent(metadata) {
  return new Graph(metadata);
}
