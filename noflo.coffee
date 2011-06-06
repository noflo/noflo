# The main NoFlo runner

internalSocket = require "./internalSocket"

processes = []
connections = []
sockets = []

initializeNode = (node) ->
    process = {}

    if node.component
        process.component = require "./components/#{node.component}"

    process.id = node.id

    unless node.out
        node.out = []

    for port of process.component.getOutputs()
        if node[port]
            connections.push
                process: process
                from: port
                to: node[port]

    if node.config and process.component.initialize
        process.component.initialize node.config

    processes.push process

getProcess = (id) ->
    for process in processes
        if process.id is id
            return process
    null

connectProcess = (connection) ->
    socket = internalSocket.createSocket()

    outputs = connection.process.component.getOutputs()
    unless outputs[connection.from]
        console.error "No such outbound port #{connection.from} in #{process.id}"
        return
    outputs[connection.from] socket
    
    target = getProcess connection.to[0]
    unless target
        console.error "No such process #{connection.to[0]}"
        return
    inputs = target.component.getInputs()
    unless inputs[connection.to[1]]
        console.error "No such inbound port #{connection.to[1]} in #{target.id}"
    inputs[connection.to[1]] socket

    sockets.push socket

    socket.on "connect", ->
        console.error "  CONN #{connection.process.id}:#{connection.from} -> #{target.id}:#{connection.to[1]}"

    socket.on "data", (data) ->
        console.error "  DATA #{connection.process.id}:#{connection.from} -> #{target.id}:#{connection.to[1]}"

    socket.on "disconnect", ->
        console.error "  DISC #{connection.process.id}:#{connection.from} -> #{target.id}:#{connection.to[1]}"

exports.createNetwork = (graph) ->
    initializeNode node for node in graph

    connectProcess connection for connection in connections

    for socket in sockets
        socket.initialize()
