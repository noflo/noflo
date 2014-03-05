if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class Graph extends noflo.Component
  constructor: (@metadata) ->
    @network = null
    @ready = true
    @started = false
    @baseDir = null
    @loader = null

    @inPorts = new noflo.InPorts
      graph:
        datatype: 'all'
        description: 'NoFlo graph definition to be used with the subgraph component'
        required: true
        immediate: true
      start:
        datatype: 'bang'
        description: 'if attached, the network will only be started when receiving a start message'
        required: false
    @outPorts = new noflo.OutPorts

    @inPorts.on 'graph', 'data', (data) =>
      @setGraph data
    @inPorts.on 'start', 'data', =>
      do @start

  setGraph: (graph) ->
    @ready = false
    if typeof graph is 'object'
      if typeof graph.addNode is 'function'
        # Existing Graph object
        return @createNetwork graph

      # JSON definition of a graph
      noflo.graph.loadJSON graph, (instance) =>
        instance.baseDir = @baseDir
        @createNetwork instance
      return

    if graph.substr(0, 1) isnt "/" and graph.substr(1, 1) isnt ":" and process and process.cwd
      graph = "#{process.cwd()}/#{graph}"

    graph = noflo.graph.loadFile graph, (instance) =>
      instance.baseDir = @baseDir
      @createNetwork instance

  createNetwork: (graph) ->
    @description = graph.properties.description or ''

    graph.componentLoader = @loader

    noflo.createNetwork graph, (@network) =>
      @emit 'network', @network
      @network.connect =>
        notReady = false
        for name, process of @network.processes
          notReady = true unless @checkComponent name, process
        do @setToReady unless notReady
        return if @inPorts.start?.isAttached() and !@started
        @start graph
    , true

  start: (graph) ->
    @started = true
    return unless @network
    @network.sendInitials()
    return unless graph
    graph.on 'addInitial', =>
      @network.sendInitials()

  checkComponent: (name, process) ->
    unless process.component.isReady()
      process.component.once "ready", =>
        @checkComponent name, process
        @setToReady()
      return false

    @findEdgePorts name, process

    true

  isExportedInport: (port, nodeName, portName) ->
    # First we check disambiguated exported ports
    for pub, priv of @network.graph.inports
      continue unless priv.process is nodeName and priv.port is portName
      return pub

    # Then we check disambiguated ports, and if needed, fix them
    for exported in @network.graph.exports
      continue unless exported.process is nodeName and exported.port is portName
      @network.graph.checkTransactionStart()
      @network.graph.removeExport exported.public
      @network.graph.addInport exported.public, exported.process, exported.port, exported.metadata
      @network.graph.checkTransactionEnd()
      return exported.public

    # Component has exported ports and this isn't one of them
    if Object.keys(@network.graph.inports).length > 0
      return false

    return false if port.isAttached()
    return (nodeName+'.'+portName).toLowerCase()

  isExportedOutport: (port, nodeName, portName) ->
    # First we check disambiguated exported ports
    for pub, priv of @network.graph.outports
      continue unless priv.process is nodeName and priv.port is portName
      return pub

    # Then we check disambiguated ports, and if needed, fix them
    for exported in @network.graph.exports
      continue unless exported.process is nodeName and exported.port is portName
      @network.graph.checkTransactionStart()
      @network.graph.removeExport exported.public
      @network.graph.addOutport exported.public, exported.process, exported.port, exported.metadata
      @network.graph.checkTransactionEnd()
      return exported.public

    # Component has exported ports and this isn't one of them
    if Object.keys(@network.graph.outports).length > 0
      return false

    return false if port.isAttached()
    return (nodeName+'.'+portName).toLowerCase()

  setToReady: ->
    if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
      process.nextTick =>
        @ready = true
        @emit 'ready'
    else
      setTimeout =>
        @ready = true
        @emit 'ready'
      , 0

  findEdgePorts: (name, process) ->
    for portName, port of process.component.inPorts
      continue if not port or typeof port is 'function' or not port.canAttach
      targetPortName = @isExportedInport port, name, portName
      continue if targetPortName is false
      @inPorts.add targetPortName, port

    for portName, port of process.component.outPorts
      continue if not port or typeof port is 'function' or not port.canAttach
      targetPortName = @isExportedOutport port, name, portName
      continue if targetPortName is false
      @outPorts.add targetPortName, port

    return true

  isReady: ->
    @ready

  isSubgraph: ->
    true

  shutdown: ->
    return unless @network
    @network.stop()

exports.getComponent = (metadata) -> new Graph metadata
