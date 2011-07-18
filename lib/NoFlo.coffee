# The main NoFlo runner

internalSocket = require "./InternalSocket"
component = require "./Component"
port = require "./Port"
graph = require "./Graph"

class NoFlo
    processes: {}

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
                throw error
        return implementation unless implementation.getComponent
        # New component API
        return implementation.getComponent()

    addNode: (node) ->
        return if @processes[node.id]

        process = {}

        if node.component
            process.component = @load node.component

        process.id = node.id

        if node.config and process.component.initialize
            process.component.initialize node.config

        @processes[process.id] = process

    getNode: (id) ->
        @processes[id]

    connectPortNew: (socket, process, port, inbound) ->
        if inbound
            socket.to =
                process: process
                port: port
            return process.component.inPorts[port].connect socket

        socket.from =
            process: process
            port: port
        process.component.outPorts[port].connect socket

    connectPort: (socket, process, port, inbound) ->
        if process.component.inPorts
            # New API
            return @connectPortNew socket, process, port, inbound

        if inbound
            ports = process.component.getInputs()
            socket.to = 
                process: process
                port: port
        else
            ports = process.component.getOutputs()
            socket.from = 
                process: process
                port: port

        unless ports[port]
            throw new Error "No such port #{port} in #{process.id}"

        ports[port] socket

    addEdge: (edge) ->
        socket = internalSocket.createSocket()
        logSocket = (message) ->
            console.error "#{edge.from.node}:#{socket.from.port} -> #{edge.to.node}:#{socket.to.port} #{message}"
        socket.on "connect", ->
            logSocket "CONN"
        socket.on "disconnect", ->
            logSocket "DISC"
        socket.on "data", ->
            logSocket "DATA"

        from = @getNode edge.from.node
        unless from
            throw new Error "No process defined for outbound node #{edge.from.node}"
        to = @getNode edge.to.node
        unless to
            throw new Error "No process defined for inbound node #{edge.to.node}"

        @connectPort socket, from, edge.from.port, false
        @connectPort socket, to, edge.to.port, true

    addInitial: (initializer) ->
        socket = internalSocket.createSocket()
        to = @getNode initializer.to.node
        unless to
            throw new Error "No process defined for inbound node #{initializer.to.node}"
        @connectPort socket, to, initializer.to.port, true
        socket.connect()
        socket.send initializer.from.data
        socket.disconnect()

exports.createNetwork = (graph) ->
    network = new NoFlo()

    network.addNode node for node in graph.nodes
    network.addEdge edge for edge in graph.edges
    network.addInitial initializer for initializer in graph.initializers

    network

exports.loadFile = (file, success) ->
    graph.loadFile file, (net) ->
        success exports.createNetwork net

exports.Component = component.Component
exports.Port = port.Port
exports.graph = graph
