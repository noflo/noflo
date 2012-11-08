#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2011 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
internalSocket = require "./InternalSocket"
component = require "./Component"
componentLoader = require "./ComponentLoader"
asynccomponent = require "./AsyncComponent"
port = require "./Port"
arrayport = require "./ArrayPort"
graph = require "./Graph"

# # The NoFlo network coordinator
#
# NoFlo networks consist of processes connected to each other
# via sockets attached from outports to inports.
#
# The role of the network coordinator is to take a graph and
# instantiate all the necessary processes from the designated
# components, attach sockets between them, and handle the sending
# of Initial Information Packets.
class NoFlo
    processes: {}
    connections: []
    graph: null
    startupDate: null
    portBuffer: {}

    constructor: (graph) ->
        @processes = {}
        @connections = []
        @graph = graph

        # As most NoFlo networks are long-running processes, the
        # network coordinator marks down the start-up time. This
        # way we can calculate the uptime of the network.
        @startupDate = new Date()

        # A NoFlo graph may change after network initialization.
        # For this, the network subscribes to the change events from
        # the graph.
        #
        # In graph we talk about nodes and edges. Nodes correspond
        # to NoFlo processes, and edges to connections between them.
        @graph.on 'addNode', (node) =>
            @addNode node
        @graph.on 'removeNode', (node) =>
            @removeNode node
        @graph.on 'addEdge', (edge) =>
            @addEdge edge
        @graph.on 'removeEdge', (edge) =>
            @removeEdge edge

        @loader = new componentLoader.ComponentLoader process.cwd()

    # The uptime of the network is the current time minus the start-up
    # time, in seconds.
    uptime: -> new Date() - @startupDate

    # ## Loading components
    #
    # Components can be passed to the NoFlo network in two ways:
    #
    # * As direct, instantiated JavaScript objects
    # * As filenames
    load: (component, callback) ->
        # Direct component instance, return as is
        if typeof component is 'object'
            return callback component
        @loader.load component, callback

    # ## Add a process to the network
    #
    # Processes can be added to a network at either start-up time
    # or later. The processes are added with a node definition object
    # that includes the following properties:
    #
    # * `id`: Identifier of the process in the network. Typically a string
    # * `component`: Filename or path of a NoFlo component, or a component instance object
    addNode: (node, callback) ->
        # Processes are treated as singletons by their identifier. If
        # we already have a process with the given ID, return that.
        return if @processes[node.id]

        process =
          id: node.id

        unless node.component
          @processes[process.id] = process
          callback process if callback
          return

        # Load the process for the node.
        @load node.component, (instance) =>
          process.component = instance

          # Store and return the process instance
          @processes[process.id] = process
          callback process if callback

    removeNode: (node) ->
        return unless @processes[node.id]

        # TODO: Check for existing edges with this node

        delete @processes[node.id]

    # Get process by its ID.
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

    # Release the IPs buffered because of an un-ready component
    flushPortBuffer: (id) ->
        buffer = @portBuffer[id]
        inports = buffer.ins
        outports = buffer.outs

        # Notify outports FIRST so that connections are attached because the floodgate is opened
        for port in outports
            port.emit("ready")

        for port in inports
            port.emit("ready")

        delete @portBuffer[id]

    # Set up a buffer for an un-ready component's port
    setupPortBuffer: (id) ->
        if @portBuffer[id]?
            @portBuffer[id].count++
        else
            @portBuffer[id] =
                ins: [] # Inports of upstream components of an un-ready component that need to buffer
                outs: [] # Outports of an un-ready component
                count: 1 # A stack count to make sure all IPs are flushed at the same time with the right order of setup (i.e. outports of an un-ready component are set first)

        @portBuffer[id]

    addEdge: (edge) ->
        return @addInitial(edge) unless edge.from.node
        socket = internalSocket.createSocket()
        @addDebug socket if @debug

        from = @getNode edge.from.node
        unless from
            throw new Error "No process defined for outbound node #{edge.from.node}"
        unless from.component
            throw new Error "No component defined for outbound node #{edge.from.node}"
        unless from.component.isReady()
            buffer = @setupPortBuffer(from.id)

            from.component.once "ready", =>
                @addEdge edge

                # When the "from" component isn't ready, it's an outgoing port
                fromPort = from.component.outPorts[edge.from.port]
                buffer.outs.push(fromPort)

                # Decrement the count and flush the buffer on empty stack ON NEXT CYCLE
                next = () =>
                  buffer.count--
                  if buffer.count is 0
                    @flushPortBuffer(from.id)

                setTimeout(next, 0)

            return

        to = @getNode edge.to.node
        unless to
            throw new Error "No process defined for inbound node #{edge.to.node}"
        unless to.component
            throw new Error "No component defined for inbound node #{edge.to.node}"
        unless to.component.isReady()
            fromPort = from.component.outPorts[edge.from.port]
            fromPort.downstreamIsGettingReady = true
            buffer = @setupPortBuffer(from.id)

            to.component.once "ready", =>
                @addEdge edge

                # When the "to" component isn't ready, it's an incoming port
                fromPort = from.component.outPorts[edge.from.port]
                buffer.ins.push(fromPort)

                # Decrement the count and flush the buffer on empty stack ON NEXT CYCLE
                next = () =>
                  buffer.count--
                  if buffer.count is 0
                    @flushPortBuffer(from.id)

                setTimeout(next, 0)

            return

        @connectPort socket, to, edge.to.port, true
        @connectPort socket, from, edge.from.port, false

        @connections.push socket

    removeEdge: (edge) ->
        for connection,index in @connections
            if edge.to.node is connection.to.process.id and edge.to.port is connection.to.port
                connection.to.process.component.inPorts[connection.to.port]?.detach connection
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
            to.component.setMaxListeners 0
            to.component.once "ready", =>
                @addInitial initializer
            return

        @connectPort socket, to, initializer.to.port, true
        @connections.push socket
        socket.connect()
        socket.send initializer.from.data
        socket.disconnect()

exports.createNetwork = (graph, debug = false, callback) ->
    network = new NoFlo graph
    network.debug = debug

    connect = ->
      network.addEdge edge for edge in graph.edges
      network.addInitial initializer for initializer in graph.initializers
      callback network if callback

    todo = graph.nodes.length
    for node in graph.nodes
      network.addNode node, ->
        todo--
        return unless todo is 0
        do connect

    network

exports.loadFile = (file, success, debug = false) ->
    graph.loadFile file, (net) ->
        success exports.createNetwork net, debug

exports.saveFile = (graph, file, success) ->
    graph.save file, ->
        success file

exports.Component = component.Component
exports.ComponentLoader = componentLoader.ComponentLoader
exports.AsyncComponent = asynccomponent.AsyncComponent
exports.Port = port.Port
exports.ArrayPort = arrayport.ArrayPort
exports.Graph = graph.Graph
exports.graph = graph
exports.internalSocket = internalSocket
