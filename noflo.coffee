# The main NoFlo runner

internalSocket = require "./internalSocket"
graph = require "./graph"

loadComponent = (component) ->
    try
        return require component
    catch error
        try
            require "./components/#{component}"
        catch localError
            # Throw the original error instead
            throw error

initializeNode = (node) ->
    process = {}

    if node.component
        process.component = loadComponent node.component

    process.id = node.id

    if node.config and process.component.initialize
        process.component.initialize node.config

    return process

getProcess = (id, processes) ->
    for process in processes
        if process.id is id
            return process
    null

connectPort = (socket, process, port, inbound) ->
    if inbound
        ports = process.component.getOutputs()
    else
        ports = process.component.getInputs()

    unless ports[port]
        throw new Error "No such port #{port} in #{process.id}"

    ports[port] socket

connectProcess = (edge, processes) ->
    socket = internalSocket.createSocket()

    from = getProcess edge.from.node, processes
    unless from
        throw new Error "No process defined for outbound node #{edge.from.node}"
    to = getProcess edge.to.node, processes
    unless to
        throw new Error "No process defined for inbound node #{edge.to.node}"

    connectPort socket, from, edge.from.port, true
    socket.from = 
        process: from
        port: edge.from.port
    
    connectPort socket, to, edge.to.port, false
    socket.to =
        process: to
        port: edge.to.port

    return socket

exports.createNetwork = (graph) ->
    sockets = []
    processes = []

    for node in graph.nodes
        processes.push initializeNode node

    for edge in graph.edges
        sockets.push connectProcess edge, processes

    for initializer in graph.initializers
        socket = internalSocket.createSocket()
        sockets.push socket
        to = getProcess initializer.to.node, processes
        connectPort socket, to, initializer.to.port, false
        socket.connect()
        socket.send initializer.from.data
        socket.disconnect()

exports.graph = graph
