noflo = require "../../lib/NoFlo"

class Graph extends noflo.Component
  constructor: ->
    @network = null
    @ready = true

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
      newPort = @isExported port, name, portName
      continue if newPort is false
      @inPorts[newPort] = @replicateInPort port, newPort

    for portName, port of process.component.outPorts
      newPort = @isExported port, name, portName
      continue if newPort is false
      @outPorts[newPort] = @replicateOutPort port, newPort

    return true

  replicatePort: (port) ->
    return new noflo.ArrayPort() if port instanceof noflo.ArrayPort
    return new noflo.Port() unless port instanceof noflo.ArrayPort

  replicateInPort: (port, portName) ->
    newPort = @replicatePort port
    newPort.on "attach", (socket) ->
      newSocket = noflo.internalSocket.createSocket()
      port.attach newSocket
    newPort.on "connect", ->
      return unless port.isAttached()
      port.connect()
    newPort.on "begingroup", (group) ->
      port.beginGroup group
    newPort.on "data", (data) ->
      port.send data
    newPort.on "endgroup", ->
      port.endGroup()
    newPort.on "disconnect", ->
      port.disconnect()
    newPort.on "detach", (socket) ->
      return unless newPort.isAttached()
      port.detach()
    newPort

  replicateOutPort: (port, portName) ->
    newPort = @replicatePort port
    newPort.on "attach", (socket) ->
      newSocket = noflo.internalSocket.createSocket()
      port.attach newSocket
    port.on "connect", ->
      return unless newPort.isAttached()
      newPort.connect()
    port.on "begingroup", (group) ->
      return unless newPort.isAttached()
      newPort.beginGroup group
    port.on "data", (data) ->
      return unless newPort.isAttached()
      newPort.send data
    port.on "endgroup", ->
      return unless newPort.isAttached()
      newPort.endGroup()
    port.on "disconnect", ->
      newPort.disconnect()
    newPort.on "detach", (socket) ->
      return unless newPort.isAttached()
      port.detach()
    newPort

  isReady: ->
    @ready

  isSubgraph: ->
    true

exports.getComponent = -> new Graph
