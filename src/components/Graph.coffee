noflo = require "../lib/NoFlo"

class Graph extends noflo.Component
  constructor: (@metadata) ->
    @network = null
    @ready = true
    @started = false
    @baseDir = null
    @loader = null
    @load = 0

    @inPorts = new noflo.InPorts
      graph:
        datatype: 'all'
        description: 'NoFlo graph definition to be used with the subgraph component'
        required: true
        immediate: true
    @outPorts = new noflo.OutPorts

    @inPorts.on 'graph', 'data', (data) =>
      @setGraph data

  setGraph: (graph) ->
    @ready = false
    if typeof graph is 'object'
      if typeof graph.addNode is 'function'
        # Existing Graph object
        return @createNetwork graph, (err) =>
          return @error err if err

      # JSON definition of a graph
      noflo.graph.loadJSON graph, (err, instance) =>
        return @error err if err
        instance.baseDir = @baseDir
        @createNetwork instance, (err) =>
          return @error err if err
      return

    if graph.substr(0, 1) isnt "/" and graph.substr(1, 1) isnt ":" and process and process.cwd
      graph = "#{process.cwd()}/#{graph}"

    graph = noflo.graph.loadFile graph, (err, instance) =>
      return @error err if err
      instance.baseDir = @baseDir
      @createNetwork instance, (err) =>
        return @error err if err

  createNetwork: (graph) ->
    @description = graph.properties.description or ''
    @icon = graph.properties.icon or @icon
    graph.name = @nodeId unless graph.name

    graph.componentLoader = @loader

    noflo.createNetwork graph, (err, @network) =>
      return @error err if err
      @emit 'network', @network
      contexts = []
      @network.on 'start', =>
        ctx = {}
        contexts.push ctx
        @activate ctx
      @network.on 'end', =>
        ctx = contexts.pop()
        return unless ctx
        @deactivate ctx
      @network.connect (err) =>
        return @error err if err
        notReady = false
        for name, node of @network.processes
          notReady = true unless @checkComponent name, node
        do @setToReady unless notReady
    , true

  start: (callback) ->
    return if @started
    unless callback
      callback = ->
    unless @isReady()
      @on 'ready', =>
        @start callback
      return
    super()
    return callback null unless @network
    @network.start (err) ->
      return callback err if err
      do callback

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

    # Then we check ambiguous ports, and if needed, fix them
    for exported in @network.graph.exports
      continue unless exported.process is nodeName and exported.port is portName
      @network.graph.checkTransactionStart()
      @network.graph.removeExport exported.public
      @network.graph.addInport exported.public, exported.process, exported.port, exported.metadata
      @network.graph.checkTransactionEnd()
      return exported.public

    # Component has exported ports and this isn't one of them
    false

  isExportedOutport: (port, nodeName, portName) ->
    # First we check disambiguated exported ports
    for pub, priv of @network.graph.outports
      continue unless priv.process is nodeName and priv.port is portName
      return pub

    # Then we check ambiguous ports, and if needed, fix them
    for exported in @network.graph.exports
      continue unless exported.process is nodeName and exported.port is portName
      @network.graph.checkTransactionStart()
      @network.graph.removeExport exported.public
      @network.graph.addOutport exported.public, exported.process, exported.port, exported.metadata
      @network.graph.checkTransactionEnd()
      return exported.public

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
    # FIXME: direct process.component.inPorts/outPorts access is only for legacy compat
    inPorts = process.component.inPorts.ports or process.component.inPorts
    outPorts = process.component.outPorts.ports or process.component.outPorts

    for portName, port of inPorts
      targetPortName = @isExportedInport port, name, portName
      continue if targetPortName is false
      @inPorts.add targetPortName, port
      @inPorts[targetPortName].once 'connect', =>
        # Start the network implicitly if we're starting to get data
        return if @isStarted()
        do @start

    for portName, port of outPorts
      targetPortName = @isExportedOutport port, name, portName
      continue if targetPortName is false
      @outPorts.add targetPortName, port

    return true

  isReady: ->
    @ready

  isSubgraph: ->
    true

  shutdown: (callback) ->
    unless callback
      callback = ->
    return callback() unless @started
    return callback null unless @network
    @network.stop (err) =>
      return callback err if err
      super()
      do callback

exports.getComponent = (metadata) -> new Graph metadata
