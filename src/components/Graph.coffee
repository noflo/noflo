noflo = require "../../lib/NoFlo"

class Graph extends noflo.Component
  constructor: ->
    @network = null
    @ready = true
    @baseDir = null

    @inPorts =
      graph: new noflo.Port()
    @outPorts = {}

    @inPorts.graph.on "data", (data) =>
      @setGraph data

  setGraph: (graph) ->
    @ready = false
    if graph instanceof noflo.Graph
      return @createNetwork graph

    if graph.substr(0, 1) isnt "/"
      graph = "#{process.cwd()}/#{graph}"

    graph = noflo.graph.loadFile graph, (instance) =>
      instance.baseDir = @baseDir
      @createNetwork instance

  createNetwork: (graph) ->
    @network = noflo.createNetwork graph, =>
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
    return false if port.isAttached()
    return newPort if @network.graph.exports.length is 0

    for exported in @network.graph.exports
      return exported.public if exported.private is newPort
    return false

  setToReady: ->
    process.nextTick =>
      @ready = true
      @emit "ready"

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

exports.getComponent = -> new Graph
