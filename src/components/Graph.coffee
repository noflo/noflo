noflo = require "noflo"

class Graph extends noflo.Component
    constructor: ->
        network = null
        ready = false

        @inPorts =
            graph: new noflo.Port()
        @outPorts = {}

        @inPorts.graph.on "data", (data) =>
            @setGraph data

    setGraph: (graph) ->
        if graph instanceof noflo.Graph
            return @createNetwork graph

        if graph.substr(0, 1) isnt "/"
            graph = "#{process.cwd()}/#{graph}"

        graph = noflo.graph.loadFile graph, (instance) =>
            @createNetwork instance

    createNetwork: (graph) ->
        @network = noflo.createNetwork graph

        for name, process of @network.processes
            for portName, port of process.component.inPorts
                continue if port.isAttached()
                newPort = "#{name.toLowerCase()}.#{portName}"
                @inPorts[newPort] = @replicateInPort port

            for portName, port of process.component.outPorts
                continue if port.isAttached()
                newPort = "#{name.toLowerCase()}.#{portName}"
                @outPorts[newPort] = @replicateOutPort port

        @ready = true
        @emit "ready"

    replicatePort: (port) ->
        return new noflo.ArrayPort() if port instanceof noflo.ArrayPort
        return new noflo.Port() unless port instanceof noflo.ArrayPort  
    replicateInPort: (port) ->
        newPort = @replicatePort port
        newPort.on "attach", (socket) ->
            newSocket = noflo.internalSocket.createSocket()
            port.attach newSocket
        newPort.on "connect", ->
            port.connect()
        newPort.on "begingroup", (group) ->
            port.beginGroup group
        newPort.on "data", (data) ->
            port.send data
        newPort.on "endgroup", ->
            port.endGroup()
        newPort.on "disconnect", ->
            port.disconnect()
        newPort

    replicateOutPort: (port) ->
        newPort = @replicatePort port
        newPort.on "attach", (socket) ->
            newSocket = noflo.internalSocket.createSocket()
            port.attach newSocket
        port.on "connect", ->
            newPort.connect()
        port.on "begingroup", (group) ->
            newPort.beginGroup group
        port.on "data", (data) ->
            newPort.send data
        port.on "endgroup", ->
            newPort.endGroup()
        port.on "disconnect", ->
            newPort.disconnect()
        newPort

    isReady: ->
        @ready

exports.getComponent = -> new Graph
