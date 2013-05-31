#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2011 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
_ = require "underscore"
internalSocket = require "./InternalSocket"
graph = require "./Graph"

if typeof process is 'object' and process.title is 'node'
  componentLoader = require "./nodejs/ComponentLoader"
  {EventEmitter} = require 'events'
else
  componentLoader = require './ComponentLoader'
  EventEmitter = require 'emitter'

# # The NoFlo network coordinator
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
  constructor: (graph) ->
    @processes = {}
    @connections = []
    @initials = []
    @graph = graph

    if typeof process is 'object' and process.title is 'node'
      # On Node.js we default the baseDir for component loading to
      # the current working directory
      @baseDir = graph.baseDir or process.cwd()
    else
      # On browser we default the baseDir to the Component loading
      # root
      @baseDir = graph.baseDir or '/'

    # As most NoFlo networks are long-running processes, the
    # network coordinator marks down the start-up time. This
    # way we can calculate the uptime of the network.
    @startupDate = new Date()
    do @handleStartEnd

    # A NoFlo graph may change after network initialization.
    # For this, the network subscribes to the change events from
    # the graph.
    #
    # In graph we talk about nodes and edges. Nodes correspond
    # to NoFlo processes, and edges to connections between them.
    @graph.on 'addNode', (node) =>
      @addNode node
    @graph.on 'removeNode', (node) =>
      @removeNode node
    @graph.on 'addEdge', (edge) =>
      @addEdge edge
    @graph.on 'removeEdge', (edge) =>
      @removeEdge edge

    # Initialize a Component Loader for the network
    @loader = new componentLoader.ComponentLoader @baseDir

  # The uptime of the network is the current time minus the start-up
  # time, in seconds.
  uptime: -> new Date() - @startupDate

  # Emit a 'start' event on the first connection, and 'end' event when
  # last connection has been closed
  handleStartEnd: ->
    connections = 0
    started = false
    ended = false
    timeOut = null
    @on 'connect', (data) =>
      return unless data.socket.from
      clearTimeout timeOut if timeOut
      if connections is 0 and not started
        @emit 'start',
          start: @startupDate
        started = true
      connections++
    @on 'disconnect', (data) =>
      return unless data.socket.from
      connections--
      return unless connections <= 0

      timeOut = setTimeout =>
        return if ended
        @emit 'end',
          start: @startupDate
          end: new Date
          uptime: @uptime()
        started = false
        ended = true
      , 10

  # ## Loading components
  #
  # Components can be passed to the NoFlo network in two ways:
  #
  # * As direct, instantiated JavaScript objects
  # * As filenames
  load: (component, callback) ->
    # Direct component instance, return as is
    if typeof component is 'object'
      return callback component
    @loader.load component, callback

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
    return if @processes[node.id]

    process =
      id: node.id

    unless node.component
      @processes[process.id] = process
      callback process if callback
      return

    # Load the process for the node.
    @load node.component, (instance) =>
      instance.nodeId = node.id
      process.component = instance

      @subscribeSubgraph node.id, instance if instance.isSubgraph()

      # Store and return the process instance
      @processes[process.id] = process
      callback process if callback

  removeNode: (node) ->
    return unless @processes[node.id]

    # TODO: Check for existing edges with this node

    delete @processes[node.id]

  # Get process by its ID.
  getNode: (id) ->
    @processes[id]

  connect: (done = ->) ->
    # Wrap the future which will be called when done in a function and return
    # it
    serialize = (next, add) =>
      (type) =>
        # Add either a Node, an Initial, or an Edge and move on to the next one
        # when done
        this["add#{type}"] add, ->
          next type

    # Serialize initializers then call callback when done
    initializers = _.reduceRight @graph.initializers, serialize, done
    # Serialize edge creators then call the initializers
    edges = _.reduceRight @graph.edges, serialize, -> initializers "Initial"
    # Serialize node creators then call the edge creators
    nodes = _.reduceRight @graph.nodes, serialize, -> edges "Edge"
    # Start with node creators
    nodes "Node"

  connectPort: (socket, process, port, inbound) ->
    if inbound
      socket.to =
        process: process
        port: port

      unless process.component.inPorts and process.component.inPorts[port]
        throw new Error "No inport '#{port}' defined in process #{process.id} (#{socket.getId()})"
        return
      return process.component.inPorts[port].attach socket

    socket.from =
      process: process
      port: port

    unless process.component.outPorts and process.component.outPorts[port]
      throw new Error "No outport '#{port}' defined in process #{process.id} (#{socket.getId()})"
      return

    process.component.outPorts[port].attach socket

  subscribeSubgraph: (nodeName, process) ->
    unless process.isReady()
      process.once 'ready', =>
        @subscribeSubgraph nodeName, process
        return

    return unless process.network

    emitSub = (type, data) =>
      data = {} unless data
      if data.subgraph
        data.subgraph = "#{nodeName}:#{data.subgraph}"
      else
        data.subgraph = nodeName
      @emit type, data

    process.network.on 'connect', (data) -> emitSub 'connect', data
    process.network.on 'begingroup', (data) -> emitSub 'begingroup', data
    process.network.on 'data', (data) -> emitSub 'data', data
    process.network.on 'endgroup', (data) -> emitSub 'endgroup', data
    process.network.on 'disconnect', (data) -> emitSub 'disconnect', data

  # Subscribe to events from all connected sockets and re-emit them
  subscribeSocket: (socket) ->
    socket.on 'connect', =>
      @emit 'connect',
        id: socket.getId()
        socket: socket
    socket.on 'begingroup', (group) =>
      @emit 'begingroup',
        id: socket.getId()
        socket: socket
        group: group
    socket.on 'data', (data) =>
      @emit 'data',
        id: socket.getId()
        socket: socket
        data: data
    socket.on 'endgroup', (group) =>
      @emit 'endgroup',
        id: socket.getId()
        socket: socket
        group: group
    socket.on 'disconnect', =>
      @emit 'disconnect',
        id: socket.getId()
        socket: socket

  addEdge: (edge, callback) ->
    return @addInitial(edge) unless edge.from.node
    socket = internalSocket.createSocket()

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

    @connectPort socket, to, edge.to.port, true
    @connectPort socket, from, edge.from.port, false

    # Subscribe to events from the socket
    @subscribeSocket socket

    @connections.push socket
    callback() if callback

  removeEdge: (edge) ->
    for connection in @connections
      continue unless connection
      continue unless edge.to.node is connection.to.process.id and edge.to.port is connection.to.port
      connection.to.process.component.inPorts[connection.to.port].detach connection
      if edge.from.node
        if connection.from and edge.from.node is connection.from.process.id and edge.from.port is connection.from.port
          connection.from.process.component.outPorts[connection.from.port].detach connection
      @connections.splice @connections.indexOf(connection), 1

  addInitial: (initializer, callback) ->
    socket = internalSocket.createSocket()

    # Subscribe to events from the socket
    @subscribeSocket socket

    to = @getNode initializer.to.node
    unless to
      throw new Error "No process defined for inbound node #{initializer.to.node}"

    unless to.component.isReady() or to.component.inPorts[initializer.to.port]
      to.component.setMaxListeners 0
      to.component.once "ready", =>
        @addInitial initializer, callback
      return

    @connectPort socket, to, initializer.to.port, true

    @connections.push socket

    @initials.push
      socket: socket
      data: initializer.from.data

    callback() if callback

  sendInitial: (initial) ->
    initial.socket.connect()
    initial.socket.send initial.data
    initial.socket.disconnect()

  sendInitials: ->
    send = =>
      @sendInitial initial for initial in @initials
      @initials = []

    if typeof process is 'object' and process.title is 'node'
      # nextTick is faster on Node.js
      process.nextTick send
    else
      setTimeout send, 0

exports.Network = Network
