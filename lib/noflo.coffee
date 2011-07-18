# The main NoFlo runner

internalSocket = require "./internalSocket"
component = require "./Component"
port = require "./Port"
graph = require "./graph"

class NoFlo
    processes: []

    load: (component) ->
        if typeof component is "object"
            return component
        try
            return require component
        catch error
            try
                return require "../components/#{component}"
            catch localError
                # Throw the original error instead
                throw error

    addNode: (node) ->
        process = {}

        if node.component
            process.component = @load node.component

        process.id = node.id

        if node.config and process.component.initialize
            process.component.initialize node.config

        @processes.push process

    getNode: (id) ->
        for process in @processes
            if process.id is id
                return process
        null

    connectPort: (socket, process, port, inbound) ->
        if inbound
            ports = process.component.getOutputs()
            socket.from = 
                process: process
                port: port
        else
            ports = process.component.getInputs()
            socket.to = 
                process: process
                port: port

        unless ports[port]
            throw new Error "No such port #{port} in #{process.id}"

        ports[port] socket

    addEdge: (edge) ->
        socket = internalSocket.createSocket()
        logSocket = (message) ->
            #console.error "#{edge.from.node}:#{socket.from.port} -> #{edge.to.node}:#{socket.to.port} #{message}"
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

        @connectPort socket, from, edge.from.port, true
        @connectPort socket, to, edge.to.port, false

    addInitial: (initializer) ->
        socket = internalSocket.createSocket()
        to = @getNode initializer.to.node
        unless to
            throw new Error "No process defined for inbound node #{initializer.to.node}"
        @connectPort socket, to, initializer.to.port, false
        socket.connect()
        socket.send initializer.from.data
        socket.disconnect()

exports.createNetwork = (graph) ->
    network = new NoFlo()

    network.addNode node for node in graph.nodes
    network.addEdge edge for edge in graph.edges
    network.addInitial initializer for initializer in graph.initializers

exports.graph = graph
exports.Component = component.Component
exports.Port = component.Port
