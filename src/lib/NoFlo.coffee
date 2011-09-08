# The main NoFlo runner

internalSocket = require "./InternalSocket"
component = require "./Component"
port = require "./Port"
arrayport = require "./ArrayPort"
graph = require "./Graph"

class NoFlo
    processes: {}
    connections: []
    graph: null
    startupDate: null

    constructor: (graph) ->
        @processes = {}
        @connections = []
        @graph = graph

        @startupDate = new Date()

        @graph.on "addNode", (node) =>
            @addNode node
        @graph.on "removeNode", (node) =>
            @removeNode node
        @graph.on "addEdge", (edge) =>
            @addEdge edge
        @graph.on "removeEdge", (edge) =>
            @removeEdge edge

    uptime: -> new Date() - @startupDate

    load: (component) ->
        if typeof component is "object"
            return component
        try
            implementation = require component
        catch error
            try
                implementation = require "../components/#{component}"
            catch localError
                # Throw the original error instead
                error.message = "#{localError.message} (#{error.message})"
                throw error
        implementation.getComponent()

    addNode: (node) ->
        return if @processes[node.id]

        process = {}

        if node.component
            process.component = @load node.component

        process.id = node.id

        if node.config and process.component.initialize
            process.component.initialize node.config

        @processes[process.id] = process

    removeNode: (node) ->
        return unless @processes[node.id]

        # TODO: Check for existing edges with this node

        delete @processes[node.id]

    getNode: (id) ->
        @processes[id]

    connectPort: (socket, process, port, inbound) ->
        if inbound
            socket.to =
                process: process
                port: port

            unless process.component.inPorts and process.component.inPorts[port]
                throw new Error "No inport '#{port}' defined in process #{process.id}"
                return

            return process.component.inPorts[port].attach socket

        socket.from =
            process: process
            port: port

        unless process.component.outPorts and process.component.outPorts[port]
            throw new Error "No outport '#{port}' defined in process #{process.id}"
            return

        process.component.outPorts[port].attach socket

    addDebug: (socket) ->
        logSocket = (message) ->
            console.error "#{socket.getId()} #{message}"
        socket.on "connect", ->
            logSocket "CONN"
        socket.on "begingroup", (group) ->
            logSocket "< #{group}"
        socket.on "disconnect", ->
            logSocket "DISC"
        socket.on "endgroup", (group) ->
            logSocket "> #{group}"
        socket.on "data", (data) ->
            logSocket "DATA"

    addEdge: (edge) ->
        return @addInitial(edge) unless edge.from.node

        socket = internalSocket.createSocket()
        @addDebug socket if @debug

        from = @getNode edge.from.node
        unless from
            throw new Error "No process defined for outbound node #{edge.from.node}"
        unless from.component.isReady()
            from.component.once "ready", =>
                @addEdge edge
            return
        to = @getNode edge.to.node
        unless to
            throw new Error "No process defined for inbound node #{edge.to.node}"
        unless to.component.isReady()
            to.component.once "ready", =>
                @addEdge edge
            return

        @connectPort socket, from, edge.from.port, false
        @connectPort socket, to, edge.to.port, true

        @connections.push socket

    removeEdge: (edge) ->
        for connection,index in @connections
            if edge.to.node is connection.to.process.id and edge.to.port is connection.to.port
                connection.to.process.component.inPorts[connection.to.port].detach connection
                @connections.splice index, 1
            if edge.from.node
                if connection.from and edge.from.node is connection.from.process.id and edge.from.port is connection.from.port
                    connection.from.process.component.inPorts[connection.from.port].detach connection
                    @connections.splice index, 1

    addInitial: (initializer) ->
        socket = internalSocket.createSocket()
        @addDebug socket if @debug

        to = @getNode initializer.to.node
        unless to
            throw new Error "No process defined for inbound node #{initializer.to.node}"

        unless to.component.isReady() or to.component.inPorts[initializer.to.port]
            to.component.once "ready", =>
                @addInitial initializer
            return

        @connectPort socket, to, initializer.to.port, true
        @connections.push socket
        socket.connect()
        socket.send initializer.from.data
        socket.disconnect()

exports.createNetwork = (graph, debug = false) ->
    network = new NoFlo graph
    network.debug = debug

    network.addNode node for node in graph.nodes
    network.addEdge edge for edge in graph.edges
    network.addInitial initializer for initializer in graph.initializers

    network

exports.loadFile = (file, success, debug = false) ->
    graph.loadFile file, (net) ->
        success exports.createNetwork net, debug

exports.saveFile = (graph, file, success) ->
    graph.save file, ->
        success file

exports.Component = component.Component
exports.Port = port.Port
exports.ArrayPort = arrayport.ArrayPort
exports.Graph = graph.Graph
exports.graph = graph
exports.internalSocket = internalSocket

# Method for extending include paths for
# NoFlo components
exports.addComponentIncludePaths = (paths) ->
  for path in paths
    require.paths.unshift path
