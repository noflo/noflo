#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2014 TheGrid (Rituwall Inc.)
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
_ = require "underscore"
internalSocket = require "./InternalSocket"
graph = require "./Graph"
{EventEmitter} = require 'events'

unless require('./Platform').isBrowser()
  componentLoader = require "./nodejs/ComponentLoader"
else
  componentLoader = require './ComponentLoader'

# ## The NoFlo network coordinator
#
# NoFlo networks consist of processes connected to each other
# via sockets attached from outports to inports.
#
# The role of the network coordinator is to take a graph and
# instantiate all the necessary processes from the designated
# components, attach sockets between them, and handle the sending
# of Initial Information Packets.
class Network extends EventEmitter
  # Processes contains all the instantiated components for this network
  processes: {}
  # Connections contains all the socket connections in the network
  connections: []
  # Initials contains all Initial Information Packets (IIPs)
  initials: []
  # Container to hold sockets that will be sending default data.
  defaults: []
  # The Graph this network is instantiated with
  graph: null
  # Start-up timestamp for the network, used for calculating uptime
  startupDate: null
  portBuffer: {}

  # All NoFlo networks are instantiated with a graph. Upon instantiation
  # they will load all the needed components, instantiate them, and
  # set up the defined connections and IIPs.
  #
  # The network will also listen to graph changes and modify itself
  # accordingly, including removing connections, adding new nodes,
  # and sending new IIPs.
  constructor: (graph, @options = {}) ->
    @processes = {}
    @connections = []
    @initials = []
    @nextInitials = []
    @defaults = []
    @graph = graph
    @started = false
    @debug = false

    # On Node.js we default the baseDir for component loading to
    # the current working directory
    if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
      @baseDir = graph.baseDir or process.cwd()
    # On browser we default the baseDir to the Component loading
    # root
    else
      @baseDir = graph.baseDir or '/'

    # As most NoFlo networks are long-running processes, the
    # network coordinator marks down the start-up time. This
    # way we can calculate the uptime of the network.
    @startupDate = new Date()

    # Initialize a Component Loader for the network
    if graph.componentLoader
      @loader = graph.componentLoader
    else
      @loader = new componentLoader.ComponentLoader @baseDir, @options

  # The uptime of the network is the current time minus the start-up
  # time, in seconds.
  uptime: -> new Date() - @startupDate

  # Emit a 'start' event on the first connection, and 'end' event when
  # last connection has been closed
  connectionCount: 0
  increaseConnections: ->
    if @connectionCount is 0
      # First connection opened, execution has now started
      @emit 'start',
        start: @startupDate
    @connectionCount++
  decreaseConnections: ->
    @connectionCount--
    # Last connection closed, execution has now ended
    if @connectionCount is 0
      ender = _.debounce =>
        return if @connectionCount
        @emit 'end',
          start: @startupDate
          end: new Date
          uptime: @uptime()
      , 10
      do ender

  # ## Loading components
  #
  # Components can be passed to the NoFlo network in two ways:
  #
  # * As direct, instantiated JavaScript objects
  # * As filenames
  load: (component, metadata, callback) ->
    @loader.load component, callback, metadata

  # ## Add a process to the network
  #
  # Processes can be added to a network at either start-up time
  # or later. The processes are added with a node definition object
  # that includes the following properties:
  #
  # * `id`: Identifier of the process in the network. Typically a string
  # * `component`: Filename or path of a NoFlo component, or a component instance object
  addNode: (node, callback) ->
    # Processes are treated as singletons by their identifier. If
    # we already have a process with the given ID, return that.
    if @processes[node.id]
      callback null, @processes[node.id] if callback
      return

    process =
      id: node.id

    # No component defined, just register the process but don't start.
    unless node.component
      @processes[process.id] = process
      callback null, process if callback
      return

    # Load the component for the process.
    @load node.component, node.metadata, (err, instance) =>
      return callback err if err
      instance.nodeId = node.id
      process.component = instance

      # Inform the ports of the node name
      for name, port of process.component.inPorts
        continue if not port or typeof port is 'function' or not port.canAttach
        port.node = node.id
        port.nodeInstance = instance
        port.name = name

      for name, port of process.component.outPorts
        continue if not port or typeof port is 'function' or not port.canAttach
        port.node = node.id
        port.nodeInstance = instance
        port.name = name

      @subscribeSubgraph process if instance.isSubgraph()
      @subscribeNode process

      # Store and return the process instance
      @processes[process.id] = process
      callback null, process if callback

  removeNode: (node, callback) ->
    unless @processes[node.id]
      return callback new Error "Node #{node.id} not found"
    @processes[node.id].component.shutdown()
    delete @processes[node.id]
    callback null if callback

  renameNode: (oldId, newId, callback) ->
    process = @getNode oldId
    return callback new Error "Process #{oldId} not found" unless process

    # Inform the process of its ID
    process.id = newId

    # Inform the ports of the node name
    for name, port of process.component.inPorts
      port.node = newId
    for name, port of process.component.outPorts
      port.node = newId

    @processes[newId] = process
    delete @processes[oldId]
    callback null if callback

  # Get process by its ID.
  getNode: (id) ->
    @processes[id]

  connect: (done = ->) ->
    # Wrap the future which will be called when done in a function and return
    # it
    callStack = 0
    serialize = (next, add) =>
      (type) =>
        # Add either a Node, an Initial, or an Edge and move on to the next one
        # when done
        this["add#{type}"] add, ->
          callStack++
          if callStack % 100 is 0
            setTimeout ->
              next type
            , 0
            return
          next type

    # Subscribe to graph changes when everything else is done
    subscribeGraph = =>
      @subscribeGraph()
      done()

    # Serialize default socket creation then call callback when done
    setDefaults = _.reduceRight @graph.nodes, serialize, subscribeGraph

    # Serialize initializers then call defaults.
    initializers = _.reduceRight @graph.initializers, serialize, -> setDefaults "Defaults"

    # Serialize edge creators then call the initializers.
    edges = _.reduceRight @graph.edges, serialize, -> initializers "Initial"

    # Serialize node creators then call the edge creators
    nodes = _.reduceRight @graph.nodes, serialize, -> edges "Edge"
    # Start with node creators
    nodes "Node"

  connectPort: (socket, process, port, index, inbound) ->
    if inbound
      socket.to =
        process: process
        port: port
        index: index

      unless process.component.inPorts and process.component.inPorts[port]
        throw new Error "No inport '#{port}' defined in process #{process.id} (#{socket.getId()})"
        return
      if process.component.inPorts[port].isAddressable()
        return process.component.inPorts[port].attach socket, index
      return process.component.inPorts[port].attach socket

    socket.from =
      process: process
      port: port
      index: index

    unless process.component.outPorts and process.component.outPorts[port]
      throw new Error "No outport '#{port}' defined in process #{process.id} (#{socket.getId()})"
      return

    if process.component.outPorts[port].isAddressable()
      return process.component.outPorts[port].attach socket, index
    process.component.outPorts[port].attach socket

  subscribeGraph: ->
    # A NoFlo graph may change after network initialization.
    # For this, the network subscribes to the change events from
    # the graph.
    #
    # In graph we talk about nodes and edges. Nodes correspond
    # to NoFlo processes, and edges to connections between them.
    graphOps = []
    processing = false
    registerOp = (op, details) ->
      graphOps.push
        op: op
        details: details
    processOps = =>
      unless graphOps.length
        processing = false
        return
      processing = true
      op = graphOps.shift()
      cb = processOps
      switch op.op
        when 'renameNode'
          @renameNode op.details.from, op.details.to, cb
        else
          @[op.op] op.details, cb

    @graph.on 'addNode', (node) =>
      registerOp 'addNode', node
      do processOps unless processing
    @graph.on 'removeNode', (node) =>
      registerOp 'removeNode', node
      do processOps unless processing
    @graph.on 'renameNode', (oldId, newId) =>
      registerOp 'renameNode',
        from: oldId
        to: newId
      do processOps unless processing
    @graph.on 'addEdge', (edge) =>
      registerOp 'addEdge', edge
      do processOps unless processing
    @graph.on 'removeEdge', (edge) =>
      registerOp 'removeEdge', edge
      do processOps unless processing
    @graph.on 'addInitial', (iip) =>
      registerOp 'addInitial', iip
      do processOps unless processing
    @graph.on 'removeInitial', (iip) =>
      registerOp 'removeInitial', iip
      do processOps unless processing

  subscribeSubgraph: (node) ->
    unless node.component.isReady()
      node.component.once 'ready', =>
        @subscribeSubgraph node
      return

    return unless node.component.network

    emitSub = (type, data) =>
      do @increaseConnections if type is 'connect'
      do @decreaseConnections if type is 'disconnect'
      data = {} unless data
      if data.subgraph
        unless data.subgraph.unshift
          data.subgraph = [data.subgraph]
        data.subgraph = data.subgraph.unshift node.id
      else
        data.subgraph = [node.id]
      @emit type, data

    node.component.network.on 'connect', (data) -> emitSub 'connect', data
    node.component.network.on 'begingroup', (data) -> emitSub 'begingroup', data
    node.component.network.on 'data', (data) -> emitSub 'data', data
    node.component.network.on 'endgroup', (data) -> emitSub 'endgroup', data
    node.component.network.on 'disconnect', (data) -> emitSub 'disconnect', data
    node.component.network.on 'process-error', (data) ->
      emitSub 'process-error', data

  # Subscribe to events from all connected sockets and re-emit them
  subscribeSocket: (socket) ->
    socket.on 'connect', =>
      do @increaseConnections
      @emit 'connect',
        id: socket.getId()
        socket: socket
        metadata: socket.metadata
    socket.on 'begingroup', (group) =>
      @emit 'begingroup',
        id: socket.getId()
        socket: socket
        group: group
        metadata: socket.metadata
    socket.on 'data', (data) =>
      @emit 'data',
        id: socket.getId()
        socket: socket
        data: data
        metadata: socket.metadata
    socket.on 'endgroup', (group) =>
      @emit 'endgroup',
        id: socket.getId()
        socket: socket
        group: group
        metadata: socket.metadata
    socket.on 'disconnect', =>
      do @decreaseConnections
      @emit 'disconnect',
        id: socket.getId()
        socket: socket
        metadata: socket.metadata
    socket.on 'error', (event) =>
      @emit 'process-error', event

  subscribeNode: (node) ->
    return unless node.component.getIcon
    node.component.on 'icon', =>
      @emit 'icon',
        id: node.id
        icon: node.component.getIcon()

  addEdge: (edge, callback) ->
    socket = internalSocket.createSocket edge.metadata

    from = @getNode edge.from.node
    unless from
      throw new Error "No process defined for outbound node #{edge.from.node}"
    unless from.component
      throw new Error "No component defined for outbound node #{edge.from.node}"
    unless from.component.isReady()
      from.component.once "ready", =>
        @addEdge edge, callback

      return

    to = @getNode edge.to.node
    unless to
      throw new Error "No process defined for inbound node #{edge.to.node}"
    unless to.component
      throw new Error "No component defined for inbound node #{edge.to.node}"
    unless to.component.isReady()
      to.component.once "ready", =>
        @addEdge edge, callback

      return

    # Subscribe to events from the socket
    @subscribeSocket socket

    @connectPort socket, to, edge.to.port, edge.to.index, true
    @connectPort socket, from, edge.from.port, edge.from.index, false

    @connections.push socket
    callback() if callback

  removeEdge: (edge, callback) ->
    for connection in @connections
      continue unless connection
      continue unless edge.to.node is connection.to.process.id and edge.to.port is connection.to.port
      connection.to.process.component.inPorts[connection.to.port].detach connection
      if edge.from.node
        if connection.from and edge.from.node is connection.from.process.id and edge.from.port is connection.from.port
          connection.from.process.component.outPorts[connection.from.port].detach connection
      @connections.splice @connections.indexOf(connection), 1
      do callback if callback

  addDefaults: (node, callback) ->

    process = @processes[node.id]

    unless process.component.isReady()
      process.component.setMaxListeners 0 if process.component.setMaxListeners
      process.component.once "ready", =>
        @addDefaults process, callback
      return

    for key, port of process.component.inPorts.ports
      # Attach a socket to any defaulted inPorts as long as they aren't already attached.
      # TODO: hasDefault existence check is for backwards compatibility, clean
      #       up when legacy ports are removed.
      if typeof port.hasDefault is 'function' and port.hasDefault() and not port.isAttached()
        socket = internalSocket.createSocket()

        # Subscribe to events from the socket
        @subscribeSocket socket

        @connectPort socket, process, key, undefined, true

        @connections.push socket

        @defaults.push socket

    callback() if callback

  addInitial: (initializer, callback) ->
    socket = internalSocket.createSocket initializer.metadata

    # Subscribe to events from the socket
    @subscribeSocket socket

    to = @getNode initializer.to.node
    unless to
      throw new Error "No process defined for inbound node #{initializer.to.node}"

    unless to.component.isReady() or to.component.inPorts[initializer.to.port]
      to.component.setMaxListeners 0 if to.component.setMaxListeners
      to.component.once "ready", =>
        @addInitial initializer, callback
      return

    @connectPort socket, to, initializer.to.port, initializer.to.index, true

    @connections.push socket

    init =
      socket: socket
      data: initializer.from.data
    @initials.push init
    @nextInitials.push init

    do @sendInitials if @isStarted()

    callback() if callback

  removeInitial: (initializer, callback) ->
    for connection in @connections
      continue unless connection
      continue unless initializer.to.node is connection.to.process.id and initializer.to.port is connection.to.port
      connection.to.process.component.inPorts[connection.to.port].detach connection
      @connections.splice @connections.indexOf(connection), 1

      for init in @initials
        continue unless init
        continue unless init.socket is connection
        @initials.splice @initials.indexOf(init), 1
      for init in @nextInitials
        continue unless init
        continue unless init.socket is connection
        @nextInitials.splice @nextInitials.indexOf(init), 1

    do callback if callback

  sendInitial: (initial) ->
    initial.socket.connect()
    initial.socket.send initial.data
    initial.socket.disconnect()

  sendInitials: ->
    send = =>
      @sendInitial initial for initial in @initials
      @initials = []

    if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
      # nextTick is faster on Node.js
      process.nextTick send
    else
      setTimeout send, 0

  isStarted: ->
    @started

  isRunning: ->
    return false unless @started
    @connectionCount > 0

  startComponents: ->
    # Perform any startup routines necessary for every component.
    for id, process of @processes
      process.component.start()

  sendDefaults: ->
    for socket in @defaults
      # Don't send defaults if more than one socket is present on the port.
      # This case should only happen when a subgraph is created as a component
      # as its network is instantiated and its inputs are serialized before
      # a socket is attached from the "parent" graph.
      continue unless socket.to.process.component.inPorts[socket.to.port].sockets.length is 1
      socket.connect()
      socket.send()
      socket.disconnect()

  start: ->
    do @stop if @started
    @started = true
    @initials = @nextInitials.slice 0
    @startComponents()
    @sendInitials()
    @sendDefaults()

  stop: ->
    # Disconnect all connections
    for connection in @connections
      continue unless connection.isConnected()
      connection.disconnect()
    # Tell processes to shut down
    for id, process of @processes
      process.component.shutdown()
    @started = false

  getDebug: () ->
    @debug

  setDebug: (active) ->
    return if active == @debug
    @debug = active

    for socket in @connections
      socket.setDebug active
    for processId, process of @processes
      instance = process.component
      instance.network.setDebug active if instance.isSubgraph()

exports.Network = Network
