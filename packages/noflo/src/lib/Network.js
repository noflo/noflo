//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./Network.d.ts" */

/* eslint-disable
    no-param-reassign,
    no-underscore-dangle,
    import/prefer-default-export,
*/

import { exportFbpJson, sameRef } from "@noflo/graph";
import { ComponentLoader } from "./ComponentLoader.js";
import { resolveHighWaterMark } from "./Edge.js";
import { EventBase } from "./EventBase.js";
import * as internalSocket from "./InternalSocket.js";
import IP from "./IP.js";
import { makeAsync } from "./Platform.js";
import { debounce } from "./Utils.js";

/**
 * @typedef NetworkProcess
 * @property {string} id
 * @property {string} [componentName]
 * @property {import("./Component.js").Component} [component]
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
 * @property {import("./ComponentLoader.js").ComponentRegistry} [registry] - Application-supplied component registry, used to construct a loader when no loader is given
 * @property {Object} [flowtrace] - Flowtrace instance to use for tracing this network run
 * @property {boolean} [asyncDelivery] - Make Information Packet delivery asynchronous
 * @property {number|null} [highWaterMark] - Default backpressure buffer size for all edges in this network; null = unbounded
 */

/**
 * @typedef { NetworkOwnOptions & import("./ComponentLoader.js").ComponentLoaderOptions} NetworkOptions
 */

/**
 * The NoFlo network coordinator.
 *
 * NoFlo networks consist of processes connected to each other via sockets
 * attached from outports to inports. The role of the network coordinator is
 * to take a graph and instantiate all the necessary processes from the
 * designated components, attach sockets between them, handle the sending of
 * Initial Information Packets, and mirror live-edit mutations back into the
 * graph model.
 */
export class Network extends EventBase {
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
    /** Network configuration passed at construction
     * @type {NetworkOptions}
     */
    this.options = options;
    /** All instantiated components of this network, keyed by node id
     * @type {Object<string, NetworkProcess>}
     */
    this.processes = {};
    /** All socket connections in the network
     * @type {Array<internalSocket.InternalSocket>}
     */
    this.connections = [];
    /** Transport-level edge observers registered via {@link Network#observe}
     * @type {((ip: any, socket: internalSocket.InternalSocket, next: () => void) => void)[]}
     */
    this.edgeObservers = [];
    /** Initial Information Packets queued for sending
     * @type {Array<NetworkIIP>}
     */
    this.initials = [];
    /** IIPs to re-send on the next network start
     * @type {Array<NetworkIIP>}
     */
    this.nextInitials = [];
    /** Sockets that will be sending default data
     * @type {Array<import("./InternalSocket.js").InternalSocket>}
     */
    this.defaults = [];
    /** The native `@noflo/graph` model this network is instantiated with, and the target of live-edit mirroring
     * @type {import("@noflo/graph").GraphModel}
     */
    this.graph = graph;
    /** Whether the network is currently started
     * @type {boolean}
     */
    this.started = false;
    /** Whether the network is currently stopped
     * @type {boolean}
     */
    this.stopped = true;
    /** Whether sockets should run in debug mode
     * @type {boolean}
     */
    this.debug = true;
    /** Whether Information Packet delivery is asynchronous
     * @type {boolean}
     */
    this.asyncDelivery = options.asyncDelivery || false;
    /** Events buffered while the network is not yet started, flushed on start
     * @type {Array<NetworkEvent>}
     */
    this.eventBuffer = [];

    // As most NoFlo networks are long-running processes, the
    // network coordinator marks down the start-up time. This
    // way we can calculate the uptime of the network.
    /** When the network was started, used to calculate uptime
     * @type {Date | null}
     */
    this.startupDate = null;

    // Initialize a Component Loader for the network. Applications pass
    // either a ready loader or an application-supplied component
    // registry (work document #16); there is no baseDir-based default
    // discovery in core.
    if (options.componentLoader) {
      /** Component loader for this network
       * @type {ComponentLoader}
       */
      this.loader = options.componentLoader;
    } else {
      /** @type {ComponentLoader} */
      this.loader = new ComponentLoader({
        registry: options.registry,
      });
    }

    // Enable Flowtrace for this network, when available
    /** Flowtrace instance recording this network's execution, when tracing is enabled
     * @type {Object|null}
     */
    this.flowtrace = null;
    /** Name under which this network is recorded to Flowtrace
     * @type {string|null}
     */
    this.flowtraceName = null;
    this.setFlowtrace(options.flowtrace || false, null);
  }

  /**
   * The uptime of the network: current time minus start-up time.
   *
   * @returns {number} Uptime in milliseconds
   */
  uptime() {
    if (!this.startupDate) {
      return 0;
    }
    return Date.now() - this.startupDate.getTime();
  }

  /**
   * Get the IDs of processes that are currently actively processing.
   *
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
        active.push(name);
      }
    });
    return active;
  }

  /**
   * Record a network event to Flowtrace, when tracing is enabled. The main
   * graph logs events from its subgraphs as well.
   *
   * @private
   * @param {string} event
   * @param {any} payload
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
      default: {
        // No default handler
      }
    }
  }

  /**
   * Emit a network lifecycle event, buffering events emitted before the
   * network has started and flushing the buffer on start. Errors, icons, and
   * network end are emitted immediately.
   *
   * @protected
   * @param {string} event
   * @param {any} payload
   */
  bufferedEmit(event, payload) {
    // Add the event to Flowtrace immediately
    this.traceEvent(event, payload);
    // Errors get emitted immediately, like does network end
    if (["icon", "process-error", "end"].includes(event)) {
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
  }

  /**
   * Load a component instance by name through the network's component
   * loader.
   *
   * @param {string} component
   * @param {Object<string, any>} metadata
   * @returns {Promise<import("./Component.js").Component>}
   */
  load(component, metadata) {
    return this.loader.load(component, metadata);
  }

  // ## Add a process to the network
  /**
   * Add a process to the network. The process is also registered with the
   * current graph. Processes can be added at start-up time or later; the
   * node definition carries the component to instantiate and its metadata.
   *
   * @param {import("@noflo/graph").GraphNode} node
   * @param {Object} [options]
   * @returns {Promise<NetworkProcess>}
   */
  addNode(node, options = {}) {
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
    return promise.then((process) => {
      if (!options.initial && !this.graph.hasNode(node.entity_id)) {
        this.graph.addNode(node);
      }
      return process;
    });
  }

  /**
   * Remove a process from the network. The process is shut down and also
   * removed from the current graph.
   *
   * @param {import("@noflo/graph").GraphNode} node
   * @returns {Promise<void>}
   */
  removeNode(node) {
    const process = this.getNode(node.entity_id);
    if (!process) {
      return Promise.reject(new Error(`Node ${node.entity_id} not found`));
    }
    let promise;
    if (!process.component) {
      delete this.processes[node.entity_id];
      promise = Promise.resolve();
    } else {
      promise = process.component.shutdown().then(() => {
        delete this.processes[node.entity_id];
        return Promise.resolve();
      });
    }
    return promise.then(() => {
      this.graph.removeNode(node.entity_id);
    });
  }

  /**
   * Rename a process in the network. Renaming also rewrites the process's
   * entry in the current graph, informing the ports of the new name.
   *
   * @param {string} oldId
   * @param {string} newId
   * @returns {Promise<void>}
   */
  renameNode(oldId, newId) {
    const process = this.getNode(oldId);
    if (!process) {
      return Promise.reject(new Error(`Process ${oldId} not found`));
    }
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
    return Promise.resolve().then(() => {
      this.graph.renameNode(oldId, newId);
    });
  }

  /**
   * Get a process of this network by its node id.
   *
   * @param {string} id - Identifier of the process
   * @returns {NetworkProcess|void}
   */
  getNode(id) {
    return this.processes[id];
  }

  /**
   * Wire the network up: instantiate every node, edge, and IIP from the
   * current graph, then attach default-value sockets. This is the step that
   * turns a graph model into running processes and connected sockets.
   *
   * @returns {Promise<this>}
   */
  connect() {
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
    return promise;
  }

  /**
   * Subscribe to a subgraph component's internal network, re-emitting its
   * `ip` and `process-error` events with the subgraph path prepended.
   *
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

    const instance =
      /** @type {import("../components/Subgraph.js").Subgraph} */ (
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

  /**
   * Subscribe to events from a socket: forward packet traffic to the edge
   * observers and the network `ip` event, and escalate process errors when
   * nobody listens.
   *
   * @param {internalSocket.InternalSocket} socket
   */
  subscribeSocket(socket) {
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
  }

  /**
   * Subscribe to a component's lifecycle events: activation counts for
   * end-detection, and icon changes.
   *
   * @param {NetworkProcess} node
   */
  subscribeNode(node) {
    if (!node.component) {
      return;
    }
    const instance = /** @type {import("./Component.js").Component} */ (
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
   * Wait until a node's component is ready to be wired up, rejecting when
   * the node or its component is missing.
   *
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
    const comp = /** @type {import("./Component.js").Component} */ (
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
   * Add a connection to the network: create the socket, attach it between
   * the two ports, and register the edge with the current graph.
   *
   * @param {import("@noflo/graph").GraphEdge} edge
   * @param {Object} [options]
   * @returns {Promise<internalSocket.InternalSocket>}
   */
  addEdge(edge, options = {}) {
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
          this.subscribeSocket(socket);

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
    return promise.then((socket) => {
      if (!options.initial) {
        this.graph.addEdge({
          from: edge.from,
          to: edge.to,
          ...(edge.metadata === undefined ? {} : { metadata: edge.metadata }),
        });
      }
      return socket;
    });
  }

  /**
   * Remove a connection from the network: detach the socket from both of
   * its ports and remove the edge from the current graph.
   *
   * @param {import("@noflo/graph").GraphEdge} edge
   * @returns {Promise<void>}
   */
  removeEdge(edge) {
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
    return Promise.resolve().then(() => {
      this.removeGraphEdge(edge);
    });
  }

  /**
   * Attach default-value sockets to any ports with defaults that are not
   * already attached. Called during connect for every node.
   *
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
   * Add an initial Information Packet to the network: create and attach its
   * socket, queue the packet, and register the IIP with the current graph.
   * When the network is running, the IIP is sent immediately.
   *
   * @param {import("@noflo/graph").GraphIIP} initializer
   * @param {Object} [options]
   * @returns {Promise<internalSocket.InternalSocket>}
   */
  addInitial(initializer, options = {}) {
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
    return promise.then((socket) => {
      if (!options.initial) {
        this.graph.addIIP({
          data: initializer.from.data,
          to: initializer.to,
          ...(initializer.metadata === undefined
            ? {}
            : { metadata: initializer.metadata }),
        });
      }
      return socket;
    });
  }

  /**
   * Remove an initial Information Packet from the network and the current
   * graph.
   *
   * @param {import("@noflo/graph").GraphIIP} initializer
   * @returns {Promise<void>}
   */
  removeInitial(initializer) {
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

    return Promise.resolve().then(() => {
      this.removeGraphIIP(initializer);
    });
  }

  /**
   * Remove the edge matching the given connection from the graph.
   *
   * @param {import("@noflo/graph").GraphEdge} edge
   * @returns {void}
   */
  removeGraphEdge(edge) {
    const match = this.graph
      .edges()
      .find(
        (candidate) =>
          sameRef(candidate.from, edge.from) && sameRef(candidate.to, edge.to),
      );
    if (!match) {
      throw new Error(
        `No edge from ${edge.from.node}:${edge.from.port} to ${edge.to.node}:${edge.to.port} to remove`,
      );
    }
    this.graph.removeEdge(match.entity_id);
  }

  /**
   * Remove the IIP matching the given initializer from the graph.
   *
   * @param {import("@noflo/graph").GraphIIP} iip
   * @returns {void}
   */
  removeGraphIIP(iip) {
    const match = this.graph
      .iips()
      .find((candidate) => sameRef(candidate.to, iip.to));
    if (!match) {
      throw new Error(
        `No IIP targeting ${iip.to.node}:${iip.to.port} to remove`,
      );
    }
    this.graph.removeIIP(match.entity_id);
  }

  /**
   * Send all queued initial Information Packets and clear the queue.
   *
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

  /**
   * Check whether the network is currently started.
   *
   * @returns {boolean}
   */
  isStarted() {
    return this.started;
  }

  /**
   * Check whether the network is currently stopped.
   *
   * @returns {boolean}
   */
  isStopped() {
    return this.stopped;
  }

  /**
   * Check whether the network has any actively processing components.
   *
   * @returns {boolean}
   */
  isRunning() {
    return this.getActiveProcesses().length > 0;
  }

  /**
   * Start every component in the network, in parallel.
   *
   * @protected
   * @returns Promise<void>
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
   * Send default values to any inports that have them but no connection or
   * IIP supplying data.
   *
   * @protected
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
   * Start the network: start all components, send the initial Information
   * Packets, and then send port defaults. Starting an already-started
   * network stops it first.
   *
   * @returns {Promise<this>}
   */
  start() {
    if (this.debouncedEnd) {
      this.abortDebounce = true;
    }

    if (this.started) {
      return this.stop().then(() => this.start());
    }
    this.initials = this.nextInitials.slice(0);
    this.eventBuffer = [];
    return this.startComponents()
      .then(() => this.sendInitials())
      .then(() => this.sendDefaults())
      .then(() => {
        this.setStarted(true);
        return Promise.resolve(this);
      });
  }

  /**
   * Stop the network: disconnect all connections and shut every component
   * down. Stopping an already-stopped network resolves immediately.
   *
   * @returns {Promise<this>}
   */
  stop() {
    if (this.debouncedEnd) {
      this.abortDebounce = true;
    }

    if (!this.started) {
      this.stopped = true;
      return Promise.resolve(this);
    }
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
      return Promise.resolve(this);
    }
    // Emit stop event when all processes are stopped
    return Promise.all(
      Object.keys(this.processes).map((id) => {
        if (!this.processes[id].component) {
          return Promise.resolve();
        }
        // eslint-disable-next-line max-len
        const comp = /** @type {import("./Component.js").Component} */ (
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

  /**
   * Mark the network started or ended, emitting the corresponding lifecycle
   * event and maintaining the start-up timestamp.
   *
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

  /**
   * End the network (emit `end`) once no process is active anymore, debounced
   * so that bursts of deactivations do not produce premature ends.
   *
   * @protected
   * @returns {void}
   */
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

  /**
   * Get the current debug mode of the network.
   *
   * @returns {boolean}
   */
  getDebug() {
    return this.debug;
  }

  /**
   * Enable or disable debug mode, propagating the setting to all sockets and
   * subgraph networks.
   *
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
        const inst =
          /** @type {import("../components/Subgraph.js").Subgraph} */ (
            instance
          );
        inst.network.setDebug(active);
      }
    });
  }

  /**
   * Enable or disable asynchronous packet delivery, propagating the setting
   * to all sockets and subgraph networks.
   *
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
        const inst =
          /** @type {import("../components/Subgraph.js").Subgraph} */ (
            instance
          );
        inst.network.setAsyncDelivery(active);
      }
    });
  }

  /**
   * Enable Flowtrace recording for this network, registering the graph and
   * all existing subgraph networks under the given name. Passing a falsy
   * value disables tracing.
   *
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
      const inst = /** @type {import("../components/Subgraph.js").Subgraph} */ (
        node.component
      );
      if (!inst.isSubgraph() || !inst.network) {
        return;
      }
      inst.network.setFlowtrace(this.flowtrace, node.componentName, false);
    });
  }
}
