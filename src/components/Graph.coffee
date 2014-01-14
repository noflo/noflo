if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class Graph extends noflo.Component
  constructor: ->
    @network = null
    @ready = true
    @started = false
    @baseDir = null
    @loader = null

    @inPorts =
      graph: new noflo.Port 'all'
      start: new noflo.Port 'bang'
    @outPorts = {}

    @inPorts.graph.on "data", (data) =>
      @setGraph data
    @inPorts.start.on "data", =>
      @started = true
      return unless @network
      @network.connect =>
        @network.sendInitials()
        notReady = false
        for name, process of @network.processes
          notReady = true unless @checkComponent name, process
        do @setToReady unless notReady

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
    graph.componentLoader = @loader
    if @inPorts.start?.isAttached() and !@started
      noflo.createNetwork graph, (@network) =>
        @emit 'network', @network
      , true
      return
    noflo.createNetwork graph, (@network) =>
      @emit 'network', @network
      notReady = false
      for name, process of @network.processes
        notReady = true unless @checkComponent name, process
      do @setToReady unless notReady

  checkComponent: (name, process) ->
    unless process.component.isReady()
      process.component.once "ready", =>
        @checkComponent name, process
        @setToReady()
      return false

    @findEdgePorts name, process

    true

  portName: (nodeName, portName) ->
    "#{nodeName.toLowerCase()}.#{portName}"

  isExported: (port, nodeName, portName) ->
    newPort = @portName nodeName, portName
    return false unless port.canAttach()
    return newPort if @network.graph.exports.length is 0

    for exported in @network.graph.exports
      return exported.public if exported.private is newPort
    return false

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
      targetPortName = @isExported port, name, portName
      continue if targetPortName is false
      @inPorts[targetPortName] = port

    for portName, port of process.component.outPorts
      targetPortName = @isExported port, name, portName
      continue if targetPortName is false
      @outPorts[targetPortName] = port

    return true

  isReady: ->
    @ready

  isSubgraph: ->
    true

  shutdown: ->
    return unless @network
    @network.stop()

exports.getComponent = -> new Graph
