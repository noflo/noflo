//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    no-param-reassign,
    no-underscore-dangle,
*/

const { EventEmitter } = require('events');
const { Flowtrace } = require('flowtrace');
const internalSocket = require('./InternalSocket');
const platform = require('./Platform');
const componentLoader = require('./ComponentLoader');
const utils = require('./Utils');
const IP = require('./IP');

function connectPort(socket, process, port, index, inbound, callback) {
  if (inbound) {
    socket.to = {
      process,
      port,
      index,
    };

    if (!process.component.inPorts || !process.component.inPorts[port]) {
      callback(new Error(`No inport '${port}' defined in process ${process.id} (${socket.getId()})`));
      return;
    }
    if (process.component.inPorts[port].isAddressable()) {
      process.component.inPorts[port].attach(socket, index);
      callback();
      return;
    }
    process.component.inPorts[port].attach(socket);
    callback();
    return;
  }

  socket.from = {
    process,
    port,
    index,
  };

  if (!process.component.outPorts || !process.component.outPorts[port]) {
    callback(new Error(`No outport '${port}' defined in process ${process.id} (${socket.getId()})`));
    return;
  }

  if (process.component.outPorts[port].isAddressable()) {
    process.component.outPorts[port].attach(socket, index);
    callback();
    return;
  }
  process.component.outPorts[port].attach(socket);
  callback();
}

function sendInitial(initial) {
  initial.socket.post(new IP('data', initial.data,
    { initial: true }));
}

// ## The NoFlo network coordinator
//
// NoFlo networks consist of processes connected to each other
// via sockets attached from outports to inports.
//
// The role of the network coordinator is to take a graph and
// instantiate all the necessary processes from the designated
// components, attach sockets between them, and handle the sending
// of Initial Information Packets.
class BaseNetwork extends EventEmitter {
  // All NoFlo networks are instantiated with a graph. Upon instantiation
  // they will load all the needed components, instantiate them, and
  // set up the defined connections and IIPs.
  constructor(graph, options) {
    if (options == null) { options = {}; }
    super();
    this.options = options;
    // Processes contains all the instantiated components for this network
    this.processes = {};
    // Connections contains all the socket connections in the network
    this.connections = [];
    // Initials contains all Initial Information Packets (IIPs)
    this.initials = [];
    this.nextInitials = [];
    // Container to hold sockets that will be sending default data.
    this.defaults = [];
    // The Graph this network is instantiated with
    this.graph = graph;
    // Enable Flowtrace for this network, when available
    this.setTrace(options.flowtrace || false);
    this.started = false;
    this.stopped = true;
    this.debug = true;
    this.eventBuffer = [];

    // On Node.js we default the baseDir for component loading to
    // the current working directory
    if (!platform.isBrowser()) {
      this.baseDir = graph.properties.baseDir || process.cwd();
    // On browser we default the baseDir to the Component loading
    // root
    } else {
      this.baseDir = graph.properties.baseDir || '/';
    }

    // As most NoFlo networks are long-running processes, the
    // network coordinator marks down the start-up time. This
    // way we can calculate the uptime of the network.
    this.startupDate = null;

    // Initialize a Component Loader for the network
    if (graph.properties.componentLoader) {
      this.loader = graph.properties.componentLoader;
    } else {
      this.loader = new componentLoader.ComponentLoader(this.baseDir, this.options);
    }
  }

  // The uptime of the network is the current time minus the start-up
  // time, in seconds.
  uptime() {
    if (!this.startupDate) {
      return 0;
    }
    return Date.now() - this.startupDate.getTime();
  }

  getActiveProcesses() {
    const active = [];
    if (!this.started) { return active; }
    Object.keys(this.processes).forEach((name) => {
      const process = this.processes[name];
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

  bufferedEmit(event, payload) {
    // Errors get emitted immediately, like does network end
    if (['icon', 'error', 'process-error', 'end'].includes(event)) {
      this.emit(event, payload);
      return;
    }
    if (!this.isStarted() && (event !== 'end')) {
      this.eventBuffer.push({
        type: event,
        payload,
      });
      return;
    }

    this.emit(event, payload);

    if (event === 'start') {
      // Once network has started we can send the IP-related events
      this.eventBuffer.forEach((ev) => {
        this.emit(ev.type, ev.payload);
      });
      this.eventBuffer = [];
    }

    if (event === 'ip') {
      // Emit also the legacy events from IP
      switch (payload.type) {
        case 'openBracket':
          this.bufferedEmit('begingroup', payload);
          return;
        case 'closeBracket':
          this.bufferedEmit('endgroup', payload);
          return;
        case 'data':
          this.bufferedEmit('data', payload);
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
  load(component, metadata, callback) {
    this.loader.load(component, callback, metadata);
  }

  // ## Add a process to the network
  //
  // Processes can be added to a network at either start-up time
  // or later. The processes are added with a node definition object
  // that includes the following properties:
  //
  // * `id`: Identifier of the process in the network. Typically a string
  // * `component`: Filename or path of a NoFlo component, or a component instance object
  addNode(node, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Processes are treated as singletons by their identifier. If
    // we already have a process with the given ID, return that.
    if (this.processes[node.id]) {
      callback(null, this.processes[node.id]);
      return;
    }

    const process = { id: node.id };

    // No component defined, just register the process but don't start.
    if (!node.component) {
      this.processes[process.id] = process;
      callback(null, process);
      return;
    }

    // Load the component for the process.
    this.load(node.component, node.metadata, (err, instance) => {
      if (err) {
        callback(err);
        return;
      }
      instance.nodeId = node.id;
      process.component = instance;
      process.componentName = node.component;

      // Inform the ports of the node name
      const inPorts = process.component.inPorts.ports;
      const outPorts = process.component.outPorts.ports;
      Object.keys(inPorts).forEach((name) => {
        const port = inPorts[name];
        port.node = node.id;
        port.nodeInstance = instance;
        port.name = name;
      });

      Object.keys(outPorts).forEach((name) => {
        const port = outPorts[name];
        port.node = node.id;
        port.nodeInstance = instance;
        port.name = name;
      });

      if (instance.isSubgraph()) { this.subscribeSubgraph(process); }

      this.subscribeNode(process);

      // Store and return the process instance
      this.processes[process.id] = process;
      callback(null, process);
    });
  }

  removeNode(node, callback) {
    const process = this.getNode(node.id);
    if (!process) {
      callback(new Error(`Node ${node.id} not found`));
      return;
    }
    process.component.shutdown((err) => {
      if (err) {
        callback(err);
        return;
      }
      delete this.processes[node.id];
      callback(null);
    });
  }

  renameNode(oldId, newId, callback) {
    const process = this.getNode(oldId);
    if (!process) {
      callback(new Error(`Process ${oldId} not found`));
      return;
    }

    // Inform the process of its ID
    process.id = newId;

    // Inform the ports of the node name
    const inPorts = process.component.inPorts.ports;
    const outPorts = process.component.outPorts.ports;
    Object.keys(inPorts).forEach((name) => {
      const port = inPorts[name];
      if (!port) { return; }
      port.node = newId;
    });
    Object.keys(outPorts).forEach((name) => {
      const port = outPorts[name];
      if (!port) { return; }
      port.node = newId;
    });

    this.processes[newId] = process;
    delete this.processes[oldId];
    callback(null);
  }

  // Get process by its ID.
  getNode(id) {
    return this.processes[id];
  }

  // eslint-disable-next-line no-unused-vars
  connect(done = (err) => {}) {
    // Wrap the future which will be called when done in a function and return
    // it
    let callStack = 0;
    const serialize = (next, add) => (type) => {
      // Add either a Node, an Initial, or an Edge and move on to the next one
      // when done
      this[`add${type}`](add,
        { initial: true },
        (err) => {
          if (err) {
            done(err);
            return;
          }
          callStack += 1;
          if ((callStack % 100) === 0) {
            setTimeout(() => {
              next(type);
            },
            0);
            return;
          }
          next(type);
        });
    };

    // Serialize default socket creation then call callback when done
    const setDefaults = utils.reduceRight(this.graph.nodes, serialize, () => {
      done();
    });

    // Serialize initializers then call defaults.
    const initializers = utils.reduceRight(this.graph.initializers, serialize, () => {
      setDefaults('Defaults');
    });

    // Serialize edge creators then call the initializers.
    const edges = utils.reduceRight(this.graph.edges, serialize, () => {
      initializers('Initial');
    });

    // Serialize node creators then call the edge creators
    const nodes = utils.reduceRight(this.graph.nodes, serialize, () => {
      edges('Edge');
    });
    // Start with node creators
    nodes('Node');
  }

  subscribeSubgraph(node) {
    if (!node.component.isReady()) {
      node.component.once('ready', () => {
        this.subscribeSubgraph(node);
      });
      return;
    }

    if (!node.component.network) {
      return;
    }

    if (this.trace) {
      // FIXME: This doesn't handle registration for sub-subgraphs
      this.trace.addGraph(node.componentName, node.component.network.graph, false);
    }

    node.component.network.setDebug(this.debug);

    const emitSub = (type, data) => {
      if ((type === 'process-error') && (this.listeners('process-error').length === 0)) {
        if (data.id && data.metadata && data.error) { throw data.error; }
        throw data;
      }
      if (!data) { data = {}; }
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

    node.component.network.on('ip', (data) => {
      emitSub('ip', data);
    });
    node.component.network.on('process-error', (data) => {
      emitSub('process-error', data);
    });
  }

  // Subscribe to events from all connected sockets and re-emit them
  subscribeSocket(socket, source) {
    socket.on('ip', (ip) => {
      this.bufferedEmit('ip', {
        id: socket.getId(),
        type: ip.type,
        socket,
        data: ip.data,
        metadata: socket.metadata,
      });
    });
    socket.on('error', (event) => {
      if (this.listeners('process-error').length === 0) {
        if (event.id && event.metadata && event.error) { throw event.error; }
        throw event;
      }
      this.bufferedEmit('process-error', event);
    });
    if (!source || !source.component || !source.component.isLegacy()) {
      return;
    }
    // Handle activation for legacy components via connects/disconnects
    socket.on('connect', () => {
      if (!source.component.__openConnections) { source.component.__openConnections = 0; }
      source.component.__openConnections += 1;
    });
    socket.on('disconnect', () => {
      source.component.__openConnections -= 1;
      if (source.component.__openConnections < 0) {
        source.component.__openConnections = 0;
      }
      if (source.component.__openConnections === 0) {
        this.checkIfFinished();
      }
    });
  }

  subscribeNode(node) {
    node.component.on('activate', () => {
      if (this.debouncedEnd) { this.abortDebounce = true; }
    });
    node.component.on('deactivate', (load) => {
      if (load > 0) { return; }
      this.checkIfFinished();
    });
    if (!node.component.getIcon) { return; }
    node.component.on('icon', () => {
      this.bufferedEmit('icon', {
        id: node.id,
        icon: node.component.getIcon(),
      });
    });
  }

  addEdge(edge, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const socket = internalSocket.createSocket(edge.metadata);
    socket.setDebug(this.debug);

    const from = this.getNode(edge.from.node);
    if (!from) {
      callback(new Error(`No process defined for outbound node ${edge.from.node}`));
      return;
    }
    if (!from.component) {
      callback(new Error(`No component defined for outbound node ${edge.from.node}`));
      return;
    }
    if (!from.component.isReady()) {
      from.component.once('ready', () => {
        this.addEdge(edge, callback);
      });

      return;
    }

    const to = this.getNode(edge.to.node);
    if (!to) {
      callback(new Error(`No process defined for inbound node ${edge.to.node}`));
      return;
    }
    if (!to.component) {
      callback(new Error(`No component defined for inbound node ${edge.to.node}`));
      return;
    }
    if (!to.component.isReady()) {
      to.component.once('ready', () => {
        this.addEdge(edge, callback);
      });

      return;
    }

    // Subscribe to events from the socket
    this.subscribeSocket(socket, from);

    connectPort(socket, to, edge.to.port, edge.to.index, true, (err) => {
      if (err) {
        callback(err);
        return;
      }
      connectPort(socket, from, edge.from.port, edge.from.index, false, (err2) => {
        if (err2) {
          callback(err2);
          return;
        }

        this.connections.push(socket);
        callback();
      });
    });
  }

  removeEdge(edge, callback) {
    this.connections.forEach((connection) => {
      if (!connection) { return; }
      if ((edge.to.node !== connection.to.process.id) || (edge.to.port !== connection.to.port)) {
        return;
      }
      connection.to.process.component.inPorts[connection.to.port].detach(connection);
      if (edge.from.node) {
        if (connection.from
          && (edge.from.node === connection.from.process.id)
          && (edge.from.port === connection.from.port)) {
          connection.from.process.component.outPorts[connection.from.port].detach(connection);
        }
      }
      this.connections.splice(this.connections.indexOf(connection), 1);
      callback();
    });
  }

  addDefaults(node, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const process = this.getNode(node.id);
    if (!process) {
      callback(new Error(`Process ${node.id} not defined`));
      return;
    }
    if (!process.component) {
      callback(new Error(`No component defined for node ${node.id}`));
      return;
    }

    if (!process.component.isReady()) {
      process.component.setMaxListeners(0);
      process.component.once('ready', () => {
        this.addDefaults(process, callback);
      });
      return;
    }

    Object.keys(process.component.inPorts.ports).forEach((key) => {
      // Attach a socket to any defaulted inPorts as long as they aren't already attached.
      const port = process.component.inPorts.ports[key];
      if (port.hasDefault() && !port.isAttached()) {
        const socket = internalSocket.createSocket();
        socket.setDebug(this.debug);

        // Subscribe to events from the socket
        this.subscribeSocket(socket);

        connectPort(socket, process, key, undefined, true, () => {});

        this.connections.push(socket);

        this.defaults.push(socket);
      }
    });

    callback();
  }

  addInitial(initializer, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const socket = internalSocket.createSocket(initializer.metadata);
    socket.setDebug(this.debug);

    // Subscribe to events from the socket
    this.subscribeSocket(socket);

    const to = this.getNode(initializer.to.node);
    if (!to) {
      callback(new Error(`No process defined for inbound node ${initializer.to.node}`));
      return;
    }
    if (!to.component) {
      callback(new Error(`No component defined for inbound node ${initializer.to.node}`));
      return;
    }

    if (!to.component.isReady() && !to.component.inPorts[initializer.to.port]) {
      to.component.setMaxListeners(0);
      to.component.once('ready', () => {
        this.addInitial(initializer, callback);
      });
      return;
    }

    connectPort(socket, to, initializer.to.port, initializer.to.index, true, (err) => {
      if (err) {
        callback(err);
        return;
      }

      this.connections.push(socket);

      const init = {
        socket,
        data: initializer.from.data,
      };
      this.initials.push(init);
      this.nextInitials.push(init);

      if (this.isRunning()) {
        // Network is running now, send initials immediately
        (this.sendInitials)();
      } else if (!this.isStopped()) {
        // Network has finished but hasn't been stopped, set
        // started and set
        this.setStarted(true);
        (this.sendInitials)();
      }

      callback();
    });
  }

  removeInitial(initializer, callback) {
    this.connections.forEach((connection) => {
      if (!connection) { return; }
      if ((initializer.to.node !== connection.to.process.id)
        || (initializer.to.port !== connection.to.port)) {
        return;
      }
      connection.to.process.component.inPorts[connection.to.port].detach(connection);
      this.connections.splice(this.connections.indexOf(connection), 1);

      for (let i = 0; i < this.initials.length; i += 1) {
        const init = this.initials[i];
        if (!init) { return; }
        if (init.socket !== connection) { return; }
        this.initials.splice(this.initials.indexOf(init), 1);
      }
      for (let i = 0; i < this.nextInitials.length; i += 1) {
        const init = this.nextInitials[i];
        if (!init) { return; }
        if (init.socket !== connection) { return; }
        this.nextInitials.splice(this.nextInitials.indexOf(init), 1);
      }
    });

    callback();
  }

  sendInitials(callback = () => {}) {
    const send = () => {
      this.initials.forEach((initial) => { sendInitial(initial); });
      this.initials = [];
      callback();
    };

    if ((typeof process !== 'undefined') && process.execPath && (process.execPath.indexOf('node') !== -1)) {
      // nextTick is faster on Node.js
      process.nextTick(send);
    } else {
      setTimeout(send, 0);
    }
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

  // eslint-disable-next-line no-unused-vars
  startComponents(callback = (err) => {}) {
    // Emit start event when all processes are started
    let count = 0;
    const length = this.processes ? Object.keys(this.processes).length : 0;
    const onProcessStart = (err) => {
      if (err) {
        callback(err);
        return;
      }
      count += 1;
      if (count === length) { callback(); }
    };

    // Perform any startup routines necessary for every component.
    if (!this.processes || !Object.keys(this.processes).length) {
      callback();
      return;
    }
    Object.keys(this.processes).forEach((id) => {
      const process = this.processes[id];
      if (process.component.isStarted()) {
        onProcessStart();
        return;
      }
      if (process.component.start.length === 0) {
        platform.deprecated('component.start method without callback is deprecated');
        process.component.start();
        onProcessStart();
        return;
      }
      process.component.start(onProcessStart);
    });
  }

  sendDefaults(callback = () => {}) {
    if (!this.defaults.length) {
      callback();
      return;
    }

    this.defaults.forEach((socket) => {
      // Don't send defaults if more than one socket is present on the port.
      // This case should only happen when a subgraph is created as a component
      // as its network is instantiated and its inputs are serialized before
      // a socket is attached from the "parent" graph.
      if (socket.to.process.component.inPorts[socket.to.port].sockets.length !== 1) { return; }
      socket.connect();
      socket.send();
      socket.disconnect();
    });

    callback();
  }

  start(callback) {
    if (!callback) {
      platform.deprecated('Calling network.start() without callback is deprecated');
      callback = () => {};
    }

    if (this.debouncedEnd) { this.abortDebounce = true; }

    if (this.started) {
      this.stop((err) => {
        if (err) {
          callback(err);
          return;
        }
        this.start(callback);
      });
      return;
    }

    this.initials = this.nextInitials.slice(0);
    this.eventBuffer = [];
    this.startComponents((err) => {
      if (err) {
        callback(err);
        return;
      }
      this.sendInitials((err2) => {
        if (err2) {
          callback(err2);
          return;
        }
        this.sendDefaults((err3) => {
          if (err3) {
            callback(err3);
            return;
          }
          this.setStarted(true);
          callback(null);
        });
      });
    });
  }

  stop(callback) {
    if (!callback) {
      platform.deprecated('Calling network.stop() without callback is deprecated');
      callback = () => {};
    }

    if (this.debouncedEnd) { this.abortDebounce = true; }

    if (!this.started) {
      this.stopped = true;
      callback(null);
      return;
    }

    // Disconnect all connections
    this.connections.forEach((connection) => {
      if (!connection.isConnected()) { return; }
      connection.disconnect();
    });

    // Emit stop event when all processes are stopped
    let count = 0;
    const length = this.processes ? Object.keys(this.processes).length : 0;
    const onProcessEnd = (err) => {
      if (err) {
        callback(err);
        return;
      }
      count += 1;
      if (count === length) {
        this.setStarted(false);
        this.stopped = true;
        callback();
      }
    };
    if (!this.processes || !Object.keys(this.processes).length) {
      this.setStarted(false);
      this.stopped = true;
      callback();
      return;
    }
    // Tell processes to shut down
    Object.keys(this.processes).forEach((id) => {
      const process = this.processes[id];
      if (!process.component.isStarted()) {
        onProcessEnd();
        return;
      }
      if (process.component.shutdown.length === 0) {
        platform.deprecated('component.shutdown method without callback is deprecated');
        process.component.shutdown();
        onProcessEnd();
        return;
      }
      process.component.shutdown(onProcessEnd);
    });
  }

  setStarted(started) {
    if (this.started === started) { return; }
    if (!started) {
      // Ending the execution
      this.started = false;
      this.bufferedEmit('end', {
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
    this.bufferedEmit('start',
      { start: this.startupDate });
  }

  checkIfFinished() {
    if (this.isRunning()) { return; }
    delete this.abortDebounce;
    if (!this.debouncedEnd) {
      this.debouncedEnd = utils.debounce(() => {
        if (this.abortDebounce) { return; }
        if (this.isRunning()) { return; }
        this.setStarted(false);
      },
      50);
    }
    (this.debouncedEnd)();
  }

  getDebug() {
    return this.debug;
  }

  setDebug(active) {
    if (active === this.debug) { return; }
    this.debug = active;

    this.connections.forEach((socket) => {
      socket.setDebug(active);
    });
    Object.keys(this.processes).forEach((processId) => {
      const process = this.processes[processId];
      const instance = process.component;
      if (instance.isSubgraph()) { instance.network.setDebug(active); }
    });
  }

  setFlowtrace(enabled) {
    if (enabled) {
      if (this.trace) {
        // We already have a tracer
        return;
      }
      this.trace = new Flowtrace({
        type: 'noflo',
      });
      this.trace.addGraph(this.graph.name, this.graph, true);
      return;
    }
    this.trace = null;
  }
}

module.exports = BaseNetwork;
