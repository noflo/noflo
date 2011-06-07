# The main NoFlo runner

internalSocket = require "./internalSocket"

loadComponent = (component) ->
    try
        return require component
    catch error
        try
            require "./components/#{component}"
        catch localError
            # Throw the original error instead
            throw error

initializeNode = (node, connections) ->
    process = {}

    if node.component
        process.component = loadComponent node.component

    process.id = node.id

    unless node.out
        node.out = []

    if process.component.getOutputs
        for port of process.component.getOutputs()
            if node[port]
                connections.push
                    process: process
                    from: port
                    to: node[port]

    if node.config and process.component.initialize
        process.component.initialize node.config

    return process

getProcess = (id, processes) ->
    for process in processes
        if process.id is id
            return process
    null

connectProcess = (connection, processes) ->
    socket = internalSocket.createSocket()

    outputs = connection.process.component.getOutputs()
    unless outputs[connection.from]
        console.error "No such outbound port #{connection.from} in #{process.id}"
        return
    outputs[connection.from] socket
    socket.from = 
        process: connection.process
        port: connection.from
    
    target = getProcess connection.to[0], processes
    unless target
        console.error "No such process #{connection.to[0]}"
        return
    inputs = target.component.getInputs()
    unless inputs[connection.to[1]]
        console.error "No such inbound port #{connection.to[1]} in #{target.id}"
        return
    inputs[connection.to[1]] socket
    socket.to =
        process: target
        port: connection.to[1]

    return socket

buildNetwork = (graph, sockets) ->
    connections = []
    processes = []

    for node in graph
        processes.push initializeNode node, connections

    for connection in connections
        sockets.push connectProcess connection, processes

exports.createNetwork = (graph) ->
    sockets = []
    buildNetwork graph, sockets

    for socket in sockets
        socket.initialize()

exports.networkToDOT = (graph) ->
    sockets = []
    buildNetwork graph, sockets

    dot = "digraph {\n"

    for socket in sockets
        dot += "    #{socket.from.process.id} -> #{socket.to.process.id} [label=#{socket.from.port}]\n"

    dot += "}"

    return dot
