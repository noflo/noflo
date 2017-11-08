#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2017 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# The Graph component is used to wrap NoFlo Networks into components inside
# another network.
noflo = require "../lib/NoFlo"

class Graph extends noflo.Component
  constructor: (metadata) ->
    super()
    @metadata = metadata
    @network = null
    @ready = true
    @started = false
    @starting = false
    @baseDir = null
    @loader = null
    @load = 0

    @inPorts = new noflo.InPorts
      graph:
        datatype: 'all'
        description: 'NoFlo graph definition to be used with the subgraph component'
        required: true
    @outPorts = new noflo.OutPorts

    @inPorts.graph.on 'ip', (packet) =>
      return unless packet.type is 'data'
      @setGraph packet.data, (err) =>
        # TODO: Port this part to Process API and use output.error method instead
        return @error err if err

  setGraph: (graph, callback) ->
    @ready = false
    if typeof graph is 'object'
      if typeof graph.addNode is 'function'
        # Existing Graph object
        @createNetwork graph, callback
        return

      # JSON definition of a graph
      noflo.graph.loadJSON graph, (err, instance) =>
        return callback err if err
        instance.baseDir = @baseDir
        @createNetwork instance, callback
      return

    if graph.substr(0, 1) isnt "/" and graph.substr(1, 1) isnt ":" and process and process.cwd
      graph = "#{process.cwd()}/#{graph}"

    noflo.graph.loadFile graph, (err, instance) =>
      return callback err if err
      instance.baseDir = @baseDir
      @createNetwork instance, callback

  createNetwork: (graph, callback) ->
    @description = graph.properties.description or ''
    @icon = graph.properties.icon or @icon

    graph.name = @nodeId unless graph.name
    graph.componentLoader = @loader

    noflo.createNetwork graph, (err, @network) =>
      return callback err if err
      @emit 'network', @network
      # Subscribe to network lifecycle
      @subscribeNetwork @network

      # Wire the network up
      @network.connect (err) =>
        return callback err if err
        for name, node of @network.processes
          # Map exported ports to local component
          @findEdgePorts name, node
        # Finally set ourselves as "ready"
        do @setToReady
        do callback
    , true

  subscribeNetwork: (network) ->
    contexts = []
    @network.on 'start', =>
      ctx = {}
      contexts.push ctx
      @activate ctx
    @network.on 'end', =>
      ctx = contexts.pop()
      return unless ctx
      @deactivate ctx

  isExportedInport: (port, nodeName, portName) ->
    # First we check disambiguated exported ports
    for pub, priv of @network.graph.inports
      continue unless priv.process is nodeName and priv.port is portName
      return pub

    # Component has exported ports and this isn't one of them
    false

  isExportedOutport: (port, nodeName, portName) ->
    # First we check disambiguated exported ports
    for pub, priv of @network.graph.outports
      continue unless priv.process is nodeName and priv.port is portName
      return pub

    # Component has exported ports and this isn't one of them
    false

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
    inPorts = process.component.inPorts.ports
    outPorts = process.component.outPorts.ports

    for portName, port of inPorts
      targetPortName = @isExportedInport port, name, portName
      continue if targetPortName is false
      @inPorts.add targetPortName, port
      @inPorts[targetPortName].on 'connect', =>
        # Start the network implicitly if we're starting to get data
        return if @starting
        return if @network.isStarted()
        if @network.startupDate
          # Network was started, but did finish. Re-start simply
          @network.setStarted true
          return
        # Network was never started, start properly
        @setUp ->

    for portName, port of outPorts
      targetPortName = @isExportedOutport port, name, portName
      continue if targetPortName is false
      @outPorts.add targetPortName, port

    return true

  isReady: ->
    @ready

  isSubgraph: ->
    true

  isLegacy: ->
    false

  setUp: (callback) ->
    @starting = true
    unless @isReady()
      @once 'ready', =>
        @setUp callback
      return
    return callback null unless @network
    @network.start (err) =>
      return callback err if err
      @starting = false
      do callback

  tearDown: (callback) ->
    @starting = false
    return callback null unless @network
    @network.stop (err) ->
      return callback err if err
      do callback

exports.getComponent = (metadata) -> new Graph metadata
