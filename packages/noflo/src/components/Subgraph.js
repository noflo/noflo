//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./Subgraph.d.ts" */

/* eslint-disable
    class-methods-use-this,
    import/no-unresolved,
    import/prefer-default-export,
*/

import { GraphModel, importFbpJson } from "@noflo/graph";
import { Component } from "../lib/Component.js";
import { Network } from "../lib/Network.js";
import { makeAsync } from "../lib/Platform.js";
import { InPorts, OutPorts } from "../lib/Ports.js";

/**
 * Options for constructing a Subgraph: the same options a `Network` takes,
 * plus the node metadata of the component instance.
 *
 * @typedef {import("../lib/Network.js").NetworkOptions & {
 *   metadata?: Object<string, any>
 * }} SubgraphOptions
 */

/**
 * A subgraph component: wraps a NoFlo network built from a graph model into
 * a component usable inside another network. The graph and the network
 * options are provided at construction; the internal network is created
 * (components loaded, sockets wired, exported ports mapped) asynchronously
 * from the constructor, with {@link Subgraph#prepared} resolving on
 * completion and the `ready` lifecycle event signalling it.
 */
export class Subgraph extends Component {
  /**
   * Create a subgraph component for the given graph definition, taking the
   * same options a `Network` takes.
   *
   * @param {import("@noflo/graph").GraphModel|Object<string, any>} graph
   *   A live graph model or an FBP JSON definition
   * @param {SubgraphOptions} [options]
   */
  constructor(graph, options = {}) {
    super();
    if (graph === undefined || graph === null) {
      throw new Error(
        "Subgraph requires a graph definition: pass a GraphModel or FBP JSON document",
      );
    }
    /** @type {Object<string, any>|undefined} Node metadata of the component instance */
    this.metadata = options.metadata;
    /** @type {import("../lib/Network.js").Network|null} */
    this.network = null;
    this.ready = true;
    this.started = false;
    this.starting = false;
    this.load = 0;
    /** @type {Promise<void>|null} */
    this.startingPromise = null;

    this.inPorts = new InPorts({});
    this.outPorts = new OutPorts({});

    this.ready = false;
    /**
     * Promise resolving when the internal network has been created and the
     * exported ports mapped.
     *
     * @type {Promise<void>}
     */
    this.prepared = this.createNetwork(
      graph instanceof GraphModel ? graph : importFbpJson(graph),
      options,
    );
  }

  /**
   * Build the internal network for the graph, wiring it up and mapping the
   * exported ports onto this component.
   *
   * @protected
   * @param {import("@noflo/graph").GraphModel} graph
   * @param {SubgraphOptions} [options]
   * @returns {Promise<void>}
   */
  createNetwork(graph, options = {}) {
    const graphMetadata = graph.graphMetadata();
    this.description = graphMetadata.description || "";
    this.icon = graphMetadata.icon || this.icon;

    const graphObj = graph;
    if (!graphObj.name && this.nodeId) {
      graphObj.name = this.nodeId;
    }

    const network = new Network(graphObj, options);

    // Keep the `network` lifecycle event asynchronous so listeners attached
    // right after construction can observe it
    return Promise.resolve()
      .then(() => {
        this.network = network;
        this.dispatchLifecycleEvent("network", network);
        // Subscribe to network lifecycle
        this.subscribeNetwork(network);
        // Wire the network up
        return network.connect();
      })
      .then(() => {
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
   * @param {import("../lib/Network.js").Network} network
   */
  subscribeNetwork(network) {
    /**
     * @type {Array<SubgraphContext>}
     */
    const contexts = [];
    network.addEventListener("start", () => {
      const ctx = {
        activated: false,
        deactivated: false,
        result: {},
      };
      contexts.push(ctx);
      this.activate(ctx);
    });
    network.addEventListener("end", () => {
      const ctx = contexts.pop();
      if (!ctx) {
        return;
      }
      this.deactivate(ctx);
    });
  }

  /**
   * @param {import("../lib/InPort.js").default} _port
   * @param {string} nodeName
   * @param {string} portName
   * @returns {boolean|string}
   */
  isExportedInport(_port, nodeName, portName) {
    if (!this.network) {
      return false;
    }
    // First we check disambiguated exported ports
    for (const exp of this.network.graph.exports()) {
      if (
        exp.direction !== "inport" ||
        exp.internal.node !== nodeName ||
        exp.internal.port !== portName
      ) {
        continue;
      }
      return exp.public;
    }

    // Component has exported ports and this isn't one of them
    return false;
  }

  /**
   * @param {import("../lib/OutPort.js").default} _port
   * @param {string} nodeName
   * @param {string} portName
   * @returns {boolean|string}
   */
  isExportedOutport(_port, nodeName, portName) {
    if (!this.network) {
      return false;
    }
    // First we check disambiguated exported ports
    for (const exp of this.network.graph.exports()) {
      if (
        exp.direction !== "outport" ||
        exp.internal.node !== nodeName ||
        exp.internal.port !== portName
      ) {
        continue;
      }
      return exp.public;
    }

    // Component has exported ports and this isn't one of them
    return false;
  }

  setToReady() {
    makeAsync(() => {
      this.ready = true;
      this.dispatchLifecycleEvent("ready");
    });
  }

  /**
   * @param {string} name
   * @param {import("../lib/Network.js").NetworkProcess} process
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
      if (typeof targetPortName !== "string") {
        return;
      }
      this.inPorts.add(targetPortName, port);
      this.inPorts.ports[targetPortName].addEventListener("connect", () => {
        // Start the network implicitly if we're starting to get data
        if (this.starting || !this.network) {
          return;
        }
        if (this.network.isStarted()) {
          return;
        }
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
      if (typeof targetPortName !== "string") {
        return;
      }
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

  setUp() {
    // Start the internal network. This is invoked when the parent
    // network starts this component, or when a user starts the component
    // directly — in both cases the internal IIPs are delivered before
    // the parent network sends its own initials or any data flows.
    // Never restart a network that is already running: the initial
    // delivery has happened, and a stop/restart cycle would tear down
    // internal component state.
    if (!this.isReady()) {
      // The graph is still being wired; wait for ready, then start. The
      // starting guard is intentionally not held while waiting, so the
      // recursive call proceeds once ready.
      this.startingPromise = new Promise((resolve, reject) => {
        /** @param {Event} _event */ const onReady = (_event) => {
          this.removeEventListener("ready", onReady);
          this.setUp().then(resolve, reject);
        };
        this.addEventListener("ready", onReady);
      });
      return this.startingPromise;
    }
    if (this.starting) {
      // A start is already in flight; do not run a second one
      // concurrently
      return this.startingPromise;
    }
    this.starting = true;
    if (!this.network) {
      this.starting = false;
      return Promise.resolve();
    }
    if (this.network.isStarted()) {
      this.starting = false;
      return Promise.resolve();
    }
    this.startingPromise = this.network.start().then(() => {
      this.starting = false;
    });
    return this.startingPromise;
  }

  tearDown() {
    this.starting = false;
    if (!this.network) {
      return Promise.resolve();
    }
    return this.network.stop().then(() => {});
  }
}
