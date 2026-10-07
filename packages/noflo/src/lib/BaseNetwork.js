//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    no-param-reassign,
    no-underscore-dangle,
    import/prefer-default-export,
*/

import { exportFbpJson } from "@noflo/graph";
import { ComponentLoader } from "./ComponentLoader.js";
import { resolveHighWaterMark } from "./Edge.js";
import * as internalSocket from "./InternalSocket.js";
import IP from "./IP.js";
import { LegacyEventBase } from "./LegacyEvents.js";
import { deprecated, makeAsync } from "./Platform.js";
import { debounce } from "./Utils.js";

/**
 * @typedef NetworkProcess
 * @property {string} id
 * @property {string} [componentName]
 * @property {import("./Component").Component} [component]
 */

/**
 * @typedef NetworkIIP
 * @property {internalSocket.InternalSocket} socket
 * @property {any} data
 */

/**
 * @typedef NetworkEvent
 * @property {string} type
 * @property {Object} payload
 */

/**
 * @param {internalSocket.InternalSocket} socket
 * @param {NetworkProcess} process
 * @param {string} port
 * @param {number|null} index
 * @param {boolean} inbound
 * @returns {Promise<internalSocket.InternalSocket>}
 */
function connectPort(socket, process, port, index, inbound) {
  if (inbound) {
    socket.to = {
      process,
      port,
      index,
    };

    if (!process.component?.inPorts?.ports[port]) {
      return Promise.reject(
        new Error(
          `No inport '${port}' defined in process ${process.id} (${socket.getId()})`,
        ),
      );
    }
    if (process.component.inPorts.ports[port].isAddressable()) {
      process.component.inPorts.ports[port].attach(socket, index);
      return Promise.resolve(socket);
    }
    process.component.inPorts.ports[port].attach(socket);
    return Promise.resolve(socket);
  }

  socket.from = {
    process,
    port,
    index,
  };

  if (!process.component?.outPorts?.ports[port]) {
    return Promise.reject(
      new Error(
        `No outport '${port}' defined in process ${process.id} (${socket.getId()})`,
      ),
    );
  }

  if (process.component.outPorts.ports[port].isAddressable()) {
    process.component.outPorts.ports[port].attach(socket, index);
    return Promise.resolve(socket);
  }
  process.component.outPorts.ports[port].attach(socket);
  return Promise.resolve(socket);
}

/**
 * @typedef NetworkOwnOptions
 * @property {ComponentLoader} [componentLoader] - Component loader instance to use, if any
 * @property {import("./ComponentLoader").ComponentRegistry} [registry] - Application-supplied component registry, used to construct a loader when no loader is given
 * @property {Object} [flowtrace] - Flowtrace instance to use for tracing this network run
 * @property {boolean} [asyncDelivery] - Make Information Packet delivery asynchronous
 * @property {number|null} [highWaterMark] - Default backpressure buffer size for all edges in this network; null = unbounded
 */

/**
 * @typedef { NetworkOwnOptions & import("./ComponentLoader").ComponentLoaderOptions} NetworkOptions
 */

// ## The NoFlo network coordinator
//
// NoFlo networks consist of processes connected to each other
// via sockets attached from outports to inports.
//
// The role of the network coordinator is to take a graph and
// instantiate all the necessary processes from the designated
// components, attach sockets between them, and handle the sending
// of Initial Information Packets.
export class BaseNetwork extends LegacyEventBase {
  /**
   * All NoFlo networks are instantiated with a graph. Upon instantiation
   * they will load all the needed components, instantiate them, and
   * set up the defined connections and IIPs.
   *
   * @param {import("@noflo/graph").GraphModel} graph - Graph definition to build a Network for
   * @param {NetworkOptions} options - Network options
   */
  constructor(graph, options = {}) {
    super();
    this.options = options;
    // Processes contains all the instantiated components for this network
    /** @type {Object<string, NetworkProcess>} */
    this.processes = {};
    // Connections contains all the socket connections in the network
    /** @type {Array<internalSocket.InternalSocket>} */
    this.connections = [];
    /** @type {((ip: any, socket: internalSocket.InternalSocket, next: () => void) => void)[]} */
    this.edgeObservers = [];
    // Initials contains all Initial Information Packets (IIPs)
    /** @type {Array<NetworkIIP>} */
    this.initials = [];
    /** @type {Array<NetworkIIP>} */
    this.nextInitials = [];
    // Container to hold sockets that will be sending default data.
    /** @type {Array<import("./InternalSocket").InternalSocket>} */
    this.defaults = [];
    // The native `@noflo/graph` model this network is instantiated with
    this.graph = graph;
    this.started = false;
    this.stopped = true;
    this.debug = true;
    this.asyncDelivery = options.asyncDelivery || false;
    /** @type {Array<NetworkEvent>} */
    this.eventBuffer = [];

    // As most NoFlo networks are long-running processes, the
    // network coordinator marks down the start-up time. This
    // way we can calculate the uptime of the network.
    /** @type {Date | null} */
    this.startupDate = null;

    // Initialize a Component Loader for the network. Applications pass
    // either a ready loader or an application-supplied component
    // registry (work document #16); there is no baseDir-based default
    // discovery in core.
    if (options.componentLoader) {
      /** @type {ComponentLoader} */
      this.loader = options.componentLoader;
    } else if (this.graph.graphMetadata().componentLoader) {
      deprecated(
        "Passing componentLoader via Graph properties is deprecated, pass via Network options instead",
      );
      /** @type {ComponentLoader} */
      this.loader = this.graph.graphMetadata().componentLoader;
    } else {
      /** @type {ComponentLoader} */
      this.loader = new ComponentLoader({
        registry: options.registry,
      });
    }

    // Enable Flowtrace for this network, when available
    this.flowtraceName = null;
    this.setFlowtrace(options.flowtrace || false, null);
  }

  // The uptime of the network is the current time minus the start-up
  // time, in seconds.
  /**
   * @returns {number}
   */
  uptime() {
    if (!this.startupDate) {
      return 0;
    }
    return Date.now() - this.startupDate.getTime();
  }

  /**
   * @returns {string[]}
   */
  getActiveProcesses() {
    /** @type {Array<string>} */
    const active = [];
    if (!this.started) {
      return active;
    }
    Object.keys(this.processes).forEach((name) => {
      const process = this.processes[name];
      if (!process?.component) {
        return;
      }
      if (process.component.load > 0) {
        // Modern component with load
        active.push(name);
      }
      if (process.component.__openConnections > 0) {
        // Legacy component
        active.push(name);
      }
    });
    return active;
  }

  /**
   * @param {string} event
   * @param {any} payload
   * @private
   */
  traceEvent(event, payload) {
    if (!this.flowtrace) {
      return;
    }
    if (this.flowtraceName && this.flowtraceName !== this.flowtrace.mainGraph) {
      // Let main graph log all events from subgraphs
      return;
    }
    switch (event) {
      case "ip": {
        let type = "data";
        if (payload.type === "openBracket") {
          type = "begingroup";
        } else if (payload.type === "closeBracket") {
          type = "endgroup";
        }
        const src = payload.socket.from
          ? {
              node: payload.socket.from.process.id,
              port: payload.socket.from.port,
            }
          : null;
        const tgt = payload.socket.to
          ? {
              node: payload.socket.to.process.id,
              port: payload.socket.to.port,
            }
          : null;
        this.flowtrace.addNetworkPacket(
          `network:${type}`,
          src,
          tgt,
          this.flowtraceName,
          {
            subgraph: payload.subgraph,
            group: payload.group,
            datatype: payload.datatype,
            schema: payload.schema,
            data: payload.data,
          },
        );
        break;
      }
      case "start": {
        this.flowtrace.addNetworkStarted(this.flowtraceName);
        break;
      }
      case "end": {
        this.flowtrace.addNetworkStopped(this.flowtraceName);
        break;
      }
      case "error": {
        this.flowtrace.addNetworkError(this.flowtraceName, payload);
        break;
      }
      default: {
        // No default handler
      }
    }
  }

  /**
   * @param {string} event
   * @param {any} payload
   * @protected
   */
  bufferedEmit(event, payload) {
    // Add the event to Flowtrace immediately
    this.traceEvent(event, payload);
    // Errors get emitted immediately, like does network end
    if (["icon", "error", "process-error", "end"].includes(event)) {
      this.dispatchLifecycleEvent(event, payload);
      return;
    }
    if (!this.isStarted() && event !== "end") {
      this.eventBuffer.push({
        type: event,
        payload,
      });
      return;
    }

    this.dispatchLifecycleEvent(event, payload);

    if (event === "start") {
      // Once network has started we can send the IP-related events
      this.eventBuffer.forEach((ev) => {
        this.dispatchLifecycleEvent(ev.type, ev.payload);
      });
      this.eventBuffer = [];
    }

    if (event === "ip") {
      // Emit also the legacy events from IP
      switch (payload.type) {
        case "openBracket":
          this.bufferedEmit("begingroup", payload);
          return;
        case "closeBracket":
          this.bufferedEmit("endgroup", payload);
          return;
        case "data":
          this.bufferedEmit("data", payload);
          break;
        default:
      }
    }
  }

  // ## Loading components
  //
  // Components can be passed to the NoFlo network in two ways:
  //
  // * As direct, instantiated JavaScript objects
  // * As filenames
  /**
   * @callback ComponentLoadCallback
   * @param {Error|null} err
   * @param {import("./Component").Component} [component]
   * @returns {void}
   */
  /**
   * @param {string} component
   * @param {import("@noflo/graph").GraphNodeMetadata} metadata
   * @param {ComponentLoadCallback} [callback]
   * @returns {Promise<import("./Component").Component>}
   */
  load(component, metadata, callback) {
    const promise = this.loader.load(component, metadata);
    if (callback) {
      deprecated(
        "Providing a callback to Network.load is deprecated, use Promises",
      );
      promise.then((instance) => {
        callback(null, instance);
      }, callback);
    }
    return promise;
  }

  // ## Add a process to the network
  //
  // Processes can be added to a network at either start-up time
  // or later. The processes are added with a node definition object
  // that includes the following properties:
  //
  // * `id`: Identifier of the process in the network. Typically a string
  // * `component`: Filename or path of a NoFlo component, or a component instance object
  /**
   * @callback AddNodeCallback
   * @param {Error|null} error
   * @param {NetworkProcess} [process]
   * @returns {void}
   */
  /**
   * @param {import("@noflo/graph").GraphNode} node
   * @param {Object} options
   * @param {AddNodeCallback} [callback]
   * @returns {Promise<NetworkProcess>}
   */
  addNode(node, options, callback) {
    if (typeof options === "function") {
      callback = /** @type {AddNodeCallback} */ (options);
      options = {};
    }
    let promise;
    // Processes are treated as singletons by their identifier. If
    // we already have a process with the given ID, return that.
    if (this.processes[node.entity_id]) {
      promise = Promise.resolve(this.processes[node.entity_id]);
    } else {
      /** @type {NetworkProcess} */
      const process = { id: node.entity_id };
      // No component defined, just register the process but don't start.
      if (!node.component) {
        this.processes[process.id] = process;
        promise = Promise.resolve(process);
      } else {
        // Load the component for the process.
        promise = this.load(node.component, node.metadata).then((instance) => {
          instance.nodeId = node.entity_id;
          process.component = instance;
          process.componentName = node.component;
          // Inform the ports of the node name
          const inPorts = process.component.inPorts.ports;
          const outPorts = process.component.outPorts.ports;
          Object.keys(inPorts).forEach((name) => {
            const port = inPorts[name];
            port.node = node.entity_id;
            port.nodeInstance = instance;
            port.name = name;
          });
          Object.keys(outPorts).forEach((name) => {
            const port = outPorts[name];
            port.node = node.entity_id;
            port.nodeInstance = instance;
            port.name = name;
          });

          if (instance.isSubgraph()) {
            this.subscribeSubgraph(process);
          }
          this.subscribeNode(process);

          // Store and return the process instance
          this.processes[process.id] = process;
          return process;
        });
      }
    }
    if (callback) {
      deprecated(
        "Providing a callback to Network.addNode is deprecated, use Promises",
      );
      promise.then((process) => {
        callback(null, process);
      }, callback);
    }
    return promise;
  }

  /**
   * @param {import("@noflo/graph").GraphNode} node
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<void>}
   */
  removeNode(node, callback) {
    let promise;
    const process = this.getNode(node.entity_id);
    if (!process) {
      promise = Promise.reject(new Error(`Node ${node.entity_id} not found`));
    } else {
      if (!process.component) {
        delete this.processes[node.entity_id];
        return Promise.resolve();
      }
      promise = process.component.shutdown().then(() => {
        delete this.processes[node.entity_id];
        return Promise.resolve();
      });
    }
    if (callback) {
      deprecated(
        "Providing a callback to Network.removeNode is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  /**
   * @param {string} oldId
   * @param {string} newId
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<void>}
   */
  renameNode(oldId, newId, callback) {
    const process = this.getNode(oldId);
    let promise;
    if (!process) {
      promise = Promise.reject(new Error(`Process ${oldId} not found`));
    } else {
      // Inform the process of its ID
      process.id = newId;
      if (process.component) {
        // Inform the ports of the node name
        const inPorts = process.component.inPorts.ports;
        const outPorts = process.component.outPorts.ports;
        Object.keys(inPorts).forEach((name) => {
          const port = inPorts[name];
          if (!port) {
            return;
          }
          port.node = newId;
        });
        Object.keys(outPorts).forEach((name) => {
          const port = outPorts[name];
          if (!port) {
            return;
          }
          port.node = newId;
        });
      }
      this.processes[newId] = process;
      delete this.processes[oldId];
      promise = Promise.resolve();
    }
    if (callback) {
      deprecated(
        "Providing a callback to Network.renameNode is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // Get process by its ID.
  /**
   * @param {string} id compone
   * @returns {NetworkProcess|void}
   */
  getNode(id) {
    return this.processes[id];
  }

  /**
   * @callback ErrorableCallback
   * @param {Error|null} [err]
   * @returns {void}
   */
  /**
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<this>}
   */
  connect(callback) {
    /**
     * @param {any[]} entities
     * @param {string} method
     * @returns {Promise<any>}
     */
    const handleAll = (entities, method) =>
      entities.reduce(
        (chain, entity) =>
          chain.then(() =>
            this[method](entity, {
              initial: true,
            }),
          ),
        Promise.resolve(),
      );

    const promise = Promise.resolve()
      .then(() => handleAll(this.graph.nodes(), "addNode"))
      .then(() => handleAll(this.graph.edges(), "addEdge"))
      .then(() => handleAll(this.graph.iips(), "addInitial"))
      .then(() => handleAll(this.graph.nodes(), "addDefaults"))
      .then(() => this);
    if (callback) {
      deprecated(
        "Providing a callback to Network.connect is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  /**
   * @private
   * @param {NetworkProcess} node
   */
  subscribeSubgraph(node) {
    if (!node.component) {
      return;
    }
    if (!node.component.isReady()) {
      /** @param {Event} _event */ const onReady = (_event) => {
        node.component.removeEventListener("ready", onReady);
        this.subscribeSubgraph(node);
      };
      node.component.addEventListener("ready", onReady);
      return;
    }

    const instance = /** @type {import("../components/Subgraph").Subgraph} */ (
      node.component
    );
    if (!instance.network) {
      return;
    }

    instance.network.setDebug(this.debug);
    instance.network.setAsyncDelivery(this.asyncDelivery);
    if (this.flowtrace) {
      instance.network.setFlowtrace(this.flowtrace, node.componentName, false);
    }

    /**
     * @param {string} type
     * @param {any} data
     */
    const emitSub = (type, data) => {
      if (
        type === "process-error" &&
        this.listeners("process-error").length === 0
      ) {
        if (data.id && data.metadata && data.error) {
          throw data.error;
        }
        throw data;
      }
      if (!data) {
        data = {};
      }
      if (data.subgraph) {
        if (!data.subgraph.unshift) {
          data.subgraph = [data.subgraph];
        }
        data.subgraph.unshift(node.id);
      } else {
        data.subgraph = [node.id];
      }
      this.bufferedEmit(type, data);
    };

    /**
     * @type {IP} data
     */
    instance.network.addEventListener("ip", (event) => {
      emitSub("ip", event.detail);
    });
    /**
     * @type {Error} data
     */
    instance.network.addEventListener("process-error", (event) => {
      emitSub("process-error", event.detail);
    });
  }

  // Subscribe to events from all connected sockets and re-emit them
  /**
   * @param {internalSocket.InternalSocket} socket
   * @param {NetworkProcess} [source]
   */
  subscribeSocket(socket, source) {
    // Transport-level observation: one stable dispatcher per edge that
    // forwards to the CURRENT network observer list at event time, so
    // observer registration can never drift out of sync with wired edges
    // (and future removal stays trivial). The dispatcher always calls
    // next() exactly once — also when there are no observers — so the
    // Edge delivery chain can never stall.
    socket.edge.observe((ip, next) => {
      let advanced = false;
      const advance = () => {
        if (advanced) {
          return;
        }
        advanced = true;
        next();
      };
      for (const observer of this.edgeObservers) {
        observer(ip, socket, advance);
      }
      advance();
    });
    socket.addEventListener("ip", (event) => {
      const ip = event.detail;
      this.bufferedEmit("ip", {
        id: socket.getId(),
        type: ip.type,
        socket,
        data: ip.data,
        metadata: socket.metadata,
      });
    });
    socket.addEventListener("error", (event) => {
      const errEvent = event.detail;
      if (this.listeners("process-error").length === 0) {
        if (errEvent.id && errEvent.metadata && errEvent.error) {
          throw errEvent.error;
        }
        throw errEvent;
      }
      this.bufferedEmit("process-error", errEvent);
    });
    if (!source?.component?.isLegacy()) {
      return;
    }
    const comp = /** @type {import("./Component").Component} */ (
      source.component
    );
    // Handle activation for legacy components via connects/disconnects
    socket.addEventListener("connect", () => {
      if (!comp.__openConnections) {
        comp.__openConnections = 0;
      }
      comp.__openConnections += 1;
    });
    socket.addEventListener("disconnect", () => {
      comp.__openConnections -= 1;
      if (comp.__openConnections < 0) {
        comp.__openConnections = 0;
      }
      if (comp.__openConnections === 0) {
        this.checkIfFinished();
      }
    });
  }

  /**
   * @param {NetworkProcess} node
   */
  subscribeNode(node) {
    if (!node.component) {
      return;
    }
    const instance = /** @type {import("./Component").Component} */ (
      node.component
    );
    instance.addEventListener("activate", () => {
      if (this.debouncedEnd) {
        this.abortDebounce = true;
      }
    });
    instance.addEventListener(
      "deactivate",
      /** @param {Event & { detail: number }} event */ (event) => {
        if (event.detail > 0) {
          return;
        }
        this.checkIfFinished();
      },
    );
    if (!instance.getIcon) {
      return;
    }
    instance.addEventListener("icon", () => {
      this.bufferedEmit("icon", {
        id: node.id,
        icon: instance.getIcon(),
      });
    });
  }

  /**
   * @protected
   * @param {string} node
   * @param {string} direction
   * @returns Promise<NetworkProcess>
   */
  ensureNode(node, direction) {
    const instance = this.getNode(node);
    if (!instance) {
      return Promise.reject(
        new Error(`No process defined for ${direction} node ${node}`),
      );
    }
    if (!instance.component) {
      return Promise.reject(
        new Error(`No component defined for ${direction} node ${node}`),
      );
    }
    const comp = /** @type {import("./Component").Component} */ (
      instance.component
    );
    if (!comp.isReady()) {
      return new Promise((resolve) => {
        /** @param {Event} _event */ const onReady = (_event) => {
          comp.removeEventListener("ready", onReady);
          resolve(instance);
        };
        comp.addEventListener("ready", onReady);
      });
    }
    return Promise.resolve(instance);
  }

  /**
   * Register a transport-level observer for every edge in this network:
   * the middleware sees each Information Packet on each edge before it is
   * delivered, as `(ip, socket, next)`. Call `next()` to continue delivery.
   * Applies to edges wired before and after registration. This is the
   * observability hook for fbp-protocol and Flowtrace; packet tracing via
   * network events is unaffected.
   *
   * @param {(ip: any, socket: internalSocket.InternalSocket, next: () => void) => void} callback
   * @returns {this}
   */
  observe(callback) {
    this.edgeObservers.push(callback);
    return this;
  }

  /**
   * @callback AddEdgeCallback
   * @param {Error|null} error
   * @param {internalSocket.InternalSocket} [socket]
   * @returns {void}
   */
  /**
   * @param {import("@noflo/graph").GraphEdge} edge
   * @param {Object} options
   * @param {AddEdgeCallback} [callback]
   * @returns {Promise<internalSocket.InternalSocket>}
   */
  addEdge(edge, options, callback) {
    if (typeof options === "function") {
      callback = /** @type {AddEdgeCallback} */ (options);
      options = {};
    }
    const promise = this.ensureNode(edge.from.node, "outbound").then((from) => {
      // Hierarchical high-water mark resolution: edge metadata wins over
      // the source port's component default, which wins over the network
      // runtime default. The socket applies its metadata on top of the
      // pre-resolved default.
      const sourcePort = /** @type {any} */ (from.component.outPorts.ports)[
        edge.from.port
      ];
      const portDefault = sourcePort?.options?.highWaterMark;
      const socket = internalSocket.createSocket(edge.metadata, {
        debug: this.debug,
        async: this.asyncDelivery,
        highWaterMark: resolveHighWaterMark(
          undefined,
          portDefault,
          this.options.highWaterMark,
        ),
      });
      return this.ensureNode(edge.to.node, "inbound")
        .then((to) => {
          // Subscribe to events from the socket
          this.subscribeSocket(socket, from);

          return connectPort(socket, to, edge.to.port, edge.to.index, true);
        })
        .then(() =>
          connectPort(socket, from, edge.from.port, edge.from.index, false),
        )
        .then(() => {
          this.connections.push(socket);
          return socket;
        });
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.addEdge is deprecated, use Promises",
      );
      promise.then((socket) => {
        callback(null, socket);
      }, callback);
    }
    return promise;
  }

  /**
   * @param {import("@noflo/graph").GraphEdge} edge
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<void>}
   */
  removeEdge(edge, callback) {
    this.connections.forEach((connection) => {
      if (!connection) {
        return;
      }
      if (
        edge.to.node !== connection.to.process.id ||
        edge.to.port !== connection.to.port
      ) {
        return;
      }
      connection.to.process.component.inPorts[connection.to.port].detach(
        connection,
      );
      if (edge.from.node) {
        if (
          connection.from &&
          edge.from.node === connection.from.process.id &&
          edge.from.port === connection.from.port
        ) {
          connection.from.process.component.outPorts[
            connection.from.port
          ].detach(connection);
        }
      }
      this.connections.splice(this.connections.indexOf(connection), 1);
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.removeEdge is deprecated, use Promises",
      );
      callback(null);
    }
    return Promise.resolve();
  }

  /**
   * @protected
   * @param {import("@noflo/graph").GraphNode} node
   * @returns {Promise<void>}
   */
  addDefaults(node) {
    return this.ensureNode(node.entity_id, "inbound")
      .then((process) =>
        Promise.all(
          Object.keys(process.component.inPorts.ports).map((key) => {
            // Attach a socket to any defaulted inPorts as long as they aren't already attached.
            const port = process.component.inPorts.ports[key];
            if (!port.hasDefault() || port.isAttached()) {
              return Promise.resolve();
            }
            const socket = internalSocket.createSocket(
              {},
              {
                debug: this.debug,
                async: this.asyncDelivery,
              },
            );

            // Subscribe to events from the socket
            this.subscribeSocket(socket);

            return connectPort(socket, process, key, undefined, true).then(
              () => {
                this.connections.push(socket);
                this.defaults.push(socket);
              },
            );
          }),
        ),
      )
      .then(() => {});
  }

  /**
   * @param {import("@noflo/graph").GraphIIP} initializer
   * @param {Object} options
   * @param {AddEdgeCallback} [callback]
   * @returns {Promise<internalSocket.InternalSocket>}
   */
  addInitial(initializer, options, callback) {
    if (typeof options === "function") {
      callback = /** @type {AddEdgeCallback} */ (options);
      options = {};
    }

    const promise = this.ensureNode(initializer.to.node, "inbound")
      .then((to) => {
        const socket = internalSocket.createSocket(initializer.metadata, {
          debug: this.debug,
          async: this.asyncDelivery,
        });

        // Subscribe to events from the socket
        this.subscribeSocket(socket);

        return connectPort(
          socket,
          to,
          initializer.to.port,
          initializer.to.index,
          true,
        );
      })
      .then((socket) => {
        this.connections.push(socket);
        const init = {
          socket,
          data: initializer.from.data,
        };
        this.initials.push(init);
        this.nextInitials.push(init);
        if (this.isRunning()) {
          // Network is running now, send initials immediately
          this.sendInitials();
        } else if (!this.isStopped()) {
          // Network has finished but hasn't been stopped, set
          // started and set
          this.setStarted(true);
          this.sendInitials();
        }
        return socket;
      });
    if (callback) {
      deprecated(
        "Providing a callback to Network.addInitial is deprecated, use Promises",
      );
      promise.then((socket) => {
        callback(null, socket);
      }, callback);
    }
    return promise;
  }

  /**
   * @param {import("@noflo/graph").GraphIIP} initializer
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<void>}
   */
  removeInitial(initializer, callback) {
    this.connections.forEach((connection) => {
      if (!connection) {
        return;
      }
      if (
        initializer.to.node !== connection.to.process.id ||
        initializer.to.port !== connection.to.port
      ) {
        return;
      }
      connection.to.process.component.inPorts[connection.to.port].detach(
        connection,
      );
      this.connections.splice(this.connections.indexOf(connection), 1);

      for (let i = 0; i < this.initials.length; i += 1) {
        const init = this.initials[i];
        if (!init) {
          return;
        }
        if (init.socket !== connection) {
          return;
        }
        this.initials.splice(this.initials.indexOf(init), 1);
      }
      for (let i = 0; i < this.nextInitials.length; i += 1) {
        const init = this.nextInitials[i];
        if (!init) {
          return;
        }
        if (init.socket !== connection) {
          return;
        }
        this.nextInitials.splice(this.nextInitials.indexOf(init), 1);
      }
    });

    if (callback) {
      deprecated(
        "Providing a callback to Network.removeInitial is deprecated, use Promises",
      );
      callback(null);
    }
    return Promise.resolve();
  }

  /**
   * @returns Promise<void>
   */
  sendInitials() {
    return new Promise((resolve) => {
      makeAsync(resolve, true);
    })
      .then(() =>
        this.initials.reduce(
          (chain, initial) =>
            chain.then(() => {
              initial.socket.post(
                new IP("data", initial.data, {
                  initial: true,
                }),
              );
              return Promise.resolve();
            }),
          Promise.resolve(),
        ),
      )
      .then(() => {
        // Clear the list of initials to still be sent
        this.initials = [];
        return Promise.resolve();
      });
  }

  isStarted() {
    return this.started;
  }

  isStopped() {
    return this.stopped;
  }

  isRunning() {
    return this.getActiveProcesses().length > 0;
  }

  /**
   * @protected
   * @returns {Promise<void>}
   */
  startComponents() {
    if (!this.processes || !Object.keys(this.processes).length) {
      return Promise.resolve();
    }
    // Perform any startup routines necessary for every component.
    return Promise.all(
      Object.keys(this.processes).map((id) => {
        const process = this.processes[id];
        if (!process.component) {
          return Promise.resolve();
        }
        return process.component.start();
      }),
    ).then(() => {});
  }

  /**
   * @returns Promise<void>
   */
  sendDefaults() {
    return Promise.all(
      this.defaults.map((socket) => {
        // Don't send defaults if more than one socket is present on the port.
        // This case should only happen when a subgraph is created as a component
        // as its network is instantiated and its inputs are serialized before
        // a socket is attached from the "parent" graph.
        if (
          socket.to.process.component.inPorts[socket.to.port].sockets.length !==
          1
        ) {
          return Promise.resolve();
        }
        socket.connect();
        socket.send();
        socket.disconnect();
        return Promise.resolve();
      }),
    ).then(() => {});
  }

  /**
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<this>}
   */
  start(callback) {
    if (this.debouncedEnd) {
      this.abortDebounce = true;
    }

    let promise;
    if (this.started) {
      promise = this.stop().then(() => this.start());
    } else {
      this.initials = this.nextInitials.slice(0);
      this.eventBuffer = [];
      promise = this.startComponents()
        .then(() => this.sendInitials())
        .then(() => this.sendDefaults())
        .then(() => {
          this.setStarted(true);
          return Promise.resolve(this);
        });
    }
    if (callback) {
      deprecated(
        "Providing a callback to Network.start is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  /**
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<this>}
   */
  stop(callback) {
    if (this.debouncedEnd) {
      this.abortDebounce = true;
    }

    let promise;
    if (!this.started) {
      this.stopped = true;
      promise = Promise.resolve(this);
    } else {
      // Disconnect all connections
      this.connections.forEach((connection) => {
        if (!connection.isConnected()) {
          return;
        }
        connection.disconnect();
      });

      if (!this.processes || !Object.keys(this.processes).length) {
        // No processes to stop
        this.setStarted(false);
        this.stopped = true;
        promise = Promise.resolve(this);
      } else {
        // Emit stop event when all processes are stopped
        promise = Promise.all(
          Object.keys(this.processes).map((id) => {
            if (!this.processes[id].component) {
              return Promise.resolve();
            }
            // eslint-disable-next-line max-len
            const comp = /** @type {import("./Component").Component} */ (
              this.processes[id].component
            );
            return comp.shutdown();
          }),
        ).then(() => {
          this.setStarted(false);
          this.stopped = true;
          return Promise.resolve(this);
        });
      }
    }
    if (callback) {
      deprecated(
        "Providing a callback to Network.stop is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  /**
   * @param {boolean} started
   */
  setStarted(started) {
    if (this.started === started) {
      return;
    }
    if (!started) {
      // Ending the execution
      this.started = false;
      this.bufferedEmit("end", {
        start: this.startupDate,
        end: new Date(),
        uptime: this.uptime(),
      });
      return;
    }

    // Starting the execution
    if (!this.startupDate) {
      this.startupDate = new Date();
    }
    this.started = true;
    this.stopped = false;
    this.bufferedEmit("start", {
      start: this.startupDate,
    });
  }

  checkIfFinished() {
    if (this.isRunning()) {
      return;
    }
    delete this.abortDebounce;
    if (!this.debouncedEnd) {
      this.debouncedEnd = debounce(() => {
        if (this.abortDebounce) {
          return;
        }
        if (this.isRunning()) {
          return;
        }
        this.setStarted(false);
      }, 50);
    }
    this.debouncedEnd();
  }

  getDebug() {
    return this.debug;
  }

  /**
   * @param {boolean} active
   */
  setDebug(active) {
    if (active === this.debug) {
      return;
    }
    this.debug = active;

    this.connections.forEach((socket) => {
      socket.setDebug(active);
    });
    Object.keys(this.processes).forEach((processId) => {
      const process = this.processes[processId];
      if (!process.component) {
        return;
      }
      const instance = process.component;
      if (instance.isSubgraph()) {
        const inst = /** @type {import("../components/Subgraph").Subgraph} */ (
          instance
        );
        inst.network.setDebug(active);
      }
    });
  }

  /**
   * @param {boolean} active
   */
  setAsyncDelivery(active) {
    if (active === this.asyncDelivery) {
      return;
    }
    this.asyncDelivery = active;

    this.connections.forEach((socket) => {
      socket.async = this.asyncDelivery;
    });
    Object.keys(this.processes).forEach((processId) => {
      const process = this.processes[processId];
      if (!process.component) {
        return;
      }
      const instance = process.component;
      if (instance.isSubgraph()) {
        const inst = /** @type {import("../components/Subgraph").Subgraph} */ (
          instance
        );
        inst.network.setAsyncDelivery(active);
      }
    });
  }

  /**
   * @param {Object|null} flowtrace
   * @param {string|null} [name]
   * @param {boolean} [main]
   */
  setFlowtrace(flowtrace, name = null, main = true) {
    if (!flowtrace) {
      this.flowtraceName = null;
      this.flowtrace = null;
      return;
    }
    if (this.flowtrace) {
      // We already have a tracer
      return;
    }
    this.flowtrace = flowtrace;
    this.flowtraceName = name || this.graph.name;
    this.flowtrace.addGraph(
      this.flowtraceName,
      exportFbpJson(this.graph),
      main,
    );
    Object.keys(this.processes).forEach((nodeId) => {
      // Register existing subgraphs
      const node = this.processes[nodeId];
      const inst = /** @type {import("../components/Subgraph").Subgraph} */ (
        node.component
      );
      if (!inst.isSubgraph() || !inst.network) {
        return;
      }
      inst.network.setFlowtrace(this.flowtrace, node.componentName, false);
    });
  }
}
