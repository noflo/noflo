#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2017 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
internalSocket = require "./InternalSocket"
graph = require "fbp-graph"
{EventEmitter} = require 'events'
platform = require './Platform'
componentLoader = require './ComponentLoader'
utils = require './Utils'
IP = require './IP'

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

  # All NoFlo networks are instantiated with a graph. Upon instantiation
  # they will load all the needed components, instantiate them, and
  # set up the defined connections and IIPs.
  #
  # The network will also listen to graph changes and modify itself
  # accordingly, including removing connections, adding new nodes,
  # and sending new IIPs.
  constructor: (graph, options = {}) ->
    super()
    @options = options
    @processes = {}
    @connections = []
    @initials = []
    @nextInitials = []
    @defaults = []
    @graph = graph
    @started = false
    @stopped = true
    @debug = true
    @eventBuffer = []

    # On Node.js we default the baseDir for component loading to
    # the current working directory
    unless platform.isBrowser()
      @baseDir = graph.baseDir or process.cwd()
    # On browser we default the baseDir to the Component loading
    # root
    else
      @baseDir = graph.baseDir or '/'

    # As most NoFlo networks are long-running processes, the
    # network coordinator marks down the start-up time. This
    # way we can calculate the uptime of the network.
    @startupDate = null

    # Initialize a Component Loader for the network
    if graph.componentLoader
      @loader = graph.componentLoader
    else
      @loader = new componentLoader.ComponentLoader @baseDir, @options

  # The uptime of the network is the current time minus the start-up
  # time, in seconds.
  uptime: ->
    return 0 unless @startupDate
    new Date() - @startupDate

  getActiveProcesses: ->
    active = []
    return active unless @started
    for name, process of @processes
      if process.component.load > 0
        # Modern component with load
        active.push name
      if process.component.__openConnections > 0
        # Legacy component
        active.push name
    return active

  bufferedEmit: (event, payload) ->
    # Errors get emitted immediately, like does network end
    if event in ['icon', 'error', 'process-error', 'end']
      @emit event, payload
      return
    if not @isStarted() and event isnt 'end'
      @eventBuffer.push
        type: event
        payload: payload
      return

    @emit event, payload

    if event is 'start'
      # Once network has started we can send the IP-related events
      for ev in @eventBuffer
        @emit ev.type, ev.payload
      @eventBuffer = []

    if event is 'ip'
      # Emit also the legacy events from IP
      switch payload.type
        when 'openBracket'
          @bufferedEmit 'begingroup', payload
          return
        when 'closeBracket'
          @bufferedEmit 'endgroup', payload
          return
        when 'data'
          @bufferedEmit 'data', payload
          return

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
      callback null, @processes[node.id]
      return

    process =
      id: node.id

    # No component defined, just register the process but don't start.
    unless node.component
      @processes[process.id] = process
      callback null, process
      return

    # Load the component for the process.
    @load node.component, node.metadata, (err, instance) =>
      return callback err if err
      instance.nodeId = node.id
      process.component = instance
      process.componentName = node.component

      # Inform the ports of the node name
      inPorts = process.component.inPorts.ports
      outPorts = process.component.outPorts.ports
      for name, port of inPorts
        port.node = node.id
        port.nodeInstance = instance
        port.name = name

      for name, port of outPorts
        port.node = node.id
        port.nodeInstance = instance
        port.name = name

      @subscribeSubgraph process if instance.isSubgraph()

      @subscribeNode process

      # Store and return the process instance
      @processes[process.id] = process
      callback null, process

  removeNode: (node, callback) ->
    process = @getNode node.id
    unless process
      return callback new Error "Node #{node.id} not found"
    process.component.shutdown (err) =>
      return callback err if err
      delete @processes[node.id]
      callback null

  renameNode: (oldId, newId, callback) ->
    process = @getNode oldId
    return callback new Error "Process #{oldId} not found" unless process

    # Inform the process of its ID
    process.id = newId

    # Inform the ports of the node name
    inPorts = process.component.inPorts.ports
    outPorts = process.component.outPorts.ports
    for name, port of inPorts
      continue unless port
      port.node = newId
    for name, port of outPorts
      continue unless port
      port.node = newId

    @processes[newId] = process
    delete @processes[oldId]
    callback null

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
        this["add#{type}"] add, (err) ->
          return done err if err
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
    setDefaults = utils.reduceRight @graph.nodes, serialize, subscribeGraph

    # Serialize initializers then call defaults.
    initializers = utils.reduceRight @graph.initializers, serialize, -> setDefaults "Defaults"

    # Serialize edge creators then call the initializers.
    edges = utils.reduceRight @graph.edges, serialize, -> initializers "Initial"

    # Serialize node creators then call the edge creators
    nodes = utils.reduceRight @graph.nodes, serialize, -> edges "Edge"
    # Start with node creators
    nodes "Node"

  connectPort: (socket, process, port, index, inbound, callback) ->
    if inbound
      socket.to =
        process: process
        port: port
        index: index

      unless process.component.inPorts and process.component.inPorts[port]
        callback new Error "No inport '#{port}' defined in process #{process.id} (#{socket.getId()})"
        return
      if process.component.inPorts[port].isAddressable()
        process.component.inPorts[port].attach socket, index
        do callback
        return
      process.component.inPorts[port].attach socket
      do callback
      return

    socket.from =
      process: process
      port: port
      index: index

    unless process.component.outPorts and process.component.outPorts[port]
      callback new Error "No outport '#{port}' defined in process #{process.id} (#{socket.getId()})"
      return

    if process.component.outPorts[port].isAddressable()
      process.component.outPorts[port].attach socket, index
      do callback
      return
    process.component.outPorts[port].attach socket
    do callback
    return

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
    processOps = (err) =>
      if err
        throw err if @listeners('process-error').length is 0
        @bufferedEmit 'process-error', err

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

    @graph.on 'addNode', (node) ->
      registerOp 'addNode', node
      do processOps unless processing
    @graph.on 'removeNode', (node) ->
      registerOp 'removeNode', node
      do processOps unless processing
    @graph.on 'renameNode', (oldId, newId) ->
      registerOp 'renameNode',
        from: oldId
        to: newId
      do processOps unless processing
    @graph.on 'addEdge', (edge) ->
      registerOp 'addEdge', edge
      do processOps unless processing
    @graph.on 'removeEdge', (edge) ->
      registerOp 'removeEdge', edge
      do processOps unless processing
    @graph.on 'addInitial', (iip) ->
      registerOp 'addInitial', iip
      do processOps unless processing
    @graph.on 'removeInitial', (iip) ->
      registerOp 'removeInitial', iip
      do processOps unless processing

  subscribeSubgraph: (node) ->
    unless node.component.isReady()
      node.component.once 'ready', =>
        @subscribeSubgraph node
      return

    return unless node.component.network

    node.component.network.setDebug @debug

    emitSub = (type, data) =>
      if type is 'process-error' and @listeners('process-error').length is 0
        throw data.error if data.id and data.metadata and data.error
        throw data
      data = {} unless data
      if data.subgraph
        unless data.subgraph.unshift
          data.subgraph = [data.subgraph]
        data.subgraph.unshift node.id
      else
        data.subgraph = [node.id]
      @bufferedEmit type, data

    node.component.network.on 'ip', (data) -> emitSub 'ip', data
    node.component.network.on 'process-error', (data) ->
      emitSub 'process-error', data

  # Subscribe to events from all connected sockets and re-emit them
  subscribeSocket: (socket, source) ->
    socket.on 'ip', (ip) =>
      @bufferedEmit 'ip',
        id: socket.getId()
        type: ip.type
        socket: socket
        data: ip.data
        metadata: socket.metadata
    socket.on 'error', (event) =>
      if @listeners('process-error').length is 0
        throw event.error if event.id and event.metadata and event.error
        throw event
      @bufferedEmit 'process-error', event
    return unless source?.component?.isLegacy()
    # Handle activation for legacy components via connects/disconnects
    socket.on 'connect', ->
      source.component.__openConnections = 0 unless source.component.__openConnections
      source.component.__openConnections++
    socket.on 'disconnect', =>
      source.component.__openConnections--
      if source.component.__openConnections < 0
        source.component.__openConnections = 0
      if source.component.__openConnections is 0
        @checkIfFinished()

  subscribeNode: (node) ->
    node.component.on 'activate', (load) =>
      @abortDebounce = true if @debouncedEnd
    node.component.on 'deactivate', (load) =>
      return if load > 0
      @checkIfFinished()
    return unless node.component.getIcon
    node.component.on 'icon', =>
      @bufferedEmit 'icon',
        id: node.id
        icon: node.component.getIcon()

  addEdge: (edge, callback) ->
    socket = internalSocket.createSocket edge.metadata
    socket.setDebug @debug

    from = @getNode edge.from.node
    unless from
      return callback new Error "No process defined for outbound node #{edge.from.node}"
    unless from.component
      return callback new Error "No component defined for outbound node #{edge.from.node}"
    unless from.component.isReady()
      from.component.once "ready", =>
        @addEdge edge, callback

      return

    to = @getNode edge.to.node
    unless to
      return callback new Error "No process defined for inbound node #{edge.to.node}"
    unless to.component
      return callback new Error "No component defined for inbound node #{edge.to.node}"
    unless to.component.isReady()
      to.component.once "ready", =>
        @addEdge edge, callback

      return

    # Subscribe to events from the socket
    @subscribeSocket socket, from

    @connectPort socket, to, edge.to.port, edge.to.index, true, (err) =>
      return callback err if err
      @connectPort socket, from, edge.from.port, edge.from.index, false, (err) =>
        return callback err if err

        @connections.push socket
        callback()

  removeEdge: (edge, callback) ->
    for connection in @connections
      continue unless connection
      continue unless edge.to.node is connection.to.process.id and edge.to.port is connection.to.port
      connection.to.process.component.inPorts[connection.to.port].detach connection
      if edge.from.node
        if connection.from and edge.from.node is connection.from.process.id and edge.from.port is connection.from.port
          connection.from.process.component.outPorts[connection.from.port].detach connection
      @connections.splice @connections.indexOf(connection), 1
      do callback

  addDefaults: (node, callback) ->
    process = @getNode node.id
    unless process
      return callback new Error "Process #{node.id} not defined"
    unless process.component
      return callback new Error "No component defined for node #{node.id}"

    unless process.component.isReady()
      process.component.setMaxListeners 0
      process.component.once "ready", =>
        @addDefaults process, callback
      return

    for key, port of process.component.inPorts.ports
      # Attach a socket to any defaulted inPorts as long as they aren't already attached.
      if port.hasDefault() and not port.isAttached()
        socket = internalSocket.createSocket()
        socket.setDebug @debug

        # Subscribe to events from the socket
        @subscribeSocket socket

        @connectPort socket, process, key, undefined, true, ->

        @connections.push socket

        @defaults.push socket

    callback()

  addInitial: (initializer, callback) ->
    socket = internalSocket.createSocket initializer.metadata
    socket.setDebug @debug

    # Subscribe to events from the socket
    @subscribeSocket socket

    to = @getNode initializer.to.node
    unless to
      return callback new Error "No process defined for inbound node #{initializer.to.node}"
    unless to.component
      return callback new Error "No component defined for inbound node #{initializer.to.node}"

    unless to.component.isReady() or to.component.inPorts[initializer.to.port]
      to.component.setMaxListeners 0
      to.component.once "ready", =>
        @addInitial initializer, callback
      return

    @connectPort socket, to, initializer.to.port, initializer.to.index, true, (err) =>
      return callback err if err

      @connections.push socket

      init =
        socket: socket
        data: initializer.from.data
      @initials.push init
      @nextInitials.push init

      if @isRunning()
        # Network is running now, send initials immediately
        do @sendInitials
      else if not @isStopped()
        # Network has finished but hasn't been stopped, set
        # started and set
        @setStarted true
        do @sendInitials

      callback()

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

    do callback

  sendInitial: (initial) ->
    initial.socket.post new IP 'data', initial.data,
      initial: true

  sendInitials: (callback) ->
    unless callback
      callback = ->

    send = =>
      @sendInitial initial for initial in @initials
      @initials = []
      do callback

    if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
      # nextTick is faster on Node.js
      process.nextTick send
    else
      setTimeout send, 0

  isStarted: ->
    @started
  isStopped: ->
    @stopped

  isRunning: ->
    return @getActiveProcesses().length > 0

  startComponents: (callback) ->
    unless callback
      callback = ->

    # Emit start event when all processes are started
    count = 0
    length = if @processes then Object.keys(@processes).length else 0
    onProcessStart = (err) ->
      return callback err if err
      count++
      callback() if count is length

    # Perform any startup routines necessary for every component.
    return callback() unless @processes and Object.keys(@processes).length
    for id, process of @processes
      if process.component.isStarted()
        onProcessStart()
        continue
      if process.component.start.length is 0
        platform.deprecated 'component.start method without callback is deprecated'
        process.component.start()
        onProcessStart()
        continue
      process.component.start onProcessStart

  sendDefaults: (callback) ->
    unless callback
      callback = ->

    return callback() unless @defaults.length

    for socket in @defaults
      # Don't send defaults if more than one socket is present on the port.
      # This case should only happen when a subgraph is created as a component
      # as its network is instantiated and its inputs are serialized before
      # a socket is attached from the "parent" graph.
      continue unless socket.to.process.component.inPorts[socket.to.port].sockets.length is 1
      socket.connect()
      socket.send()
      socket.disconnect()

    do callback

  start: (callback) ->
    unless callback
      platform.deprecated 'Calling network.start() without callback is deprecated'
      callback = ->

    @abortDebounce = true if @debouncedEnd

    if @started
      @stop (err) =>
        return callback err if err
        @start callback
      return

    @initials = @nextInitials.slice 0
    @eventBuffer = []
    @startComponents (err) =>
      return callback err if err
      @sendInitials (err) =>
        return callback err if err
        @sendDefaults (err) =>
          return callback err if err
          @setStarted true
          callback null
          return
        return
      return
    return

  stop: (callback) ->
    unless callback
      platform.deprecated 'Calling network.stop() without callback is deprecated'
      callback = ->

    @abortDebounce = true if @debouncedEnd

    unless @started
      @stopped = true
      return callback null

    # Disconnect all connections
    for connection in @connections
      continue unless connection.isConnected()
      connection.disconnect()

    # Emit stop event when all processes are stopped
    count = 0
    length = if @processes then Object.keys(@processes).length else 0
    onProcessEnd = (err) =>
      return callback err if err
      count++
      if count is length
        @setStarted false
        @stopped = true
        callback()
    unless @processes and Object.keys(@processes).length
      @setStarted false
      @stopped = true
      return callback()
    # Tell processes to shut down
    for id, process of @processes
      unless process.component.isStarted()
        onProcessEnd()
        continue
      if process.component.shutdown.length is 0
        platform.deprecated 'component.shutdown method without callback is deprecated'
        process.component.shutdown()
        onProcessEnd()
        continue
      process.component.shutdown onProcessEnd

  setStarted: (started) ->
    return if @started is started
    unless started
      # Ending the execution
      @started = false
      @bufferedEmit 'end',
        start: @startupDate
        end: new Date
        uptime: @uptime()
      return

    # Starting the execution
    @startupDate = new Date unless @startupDate
    @started = true
    @stopped = false
    @bufferedEmit 'start',
      start: @startupDate

  checkIfFinished: ->
    return if @isRunning()
    delete @abortDebounce
    unless @debouncedEnd
      @debouncedEnd = utils.debounce =>
        return if @abortDebounce
        return if @isRunning()
        @setStarted false
      , 50
    do @debouncedEnd

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
