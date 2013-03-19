noflo = require "../lib/NoFlo"

getBaseGraph = ->
    graph = new noflo.Graph "ArrayPort"
    graph.addNode "Merge", "Merge"
    graph.addNode "Drop", "Drop"
    graph.addInitial "Foo", "Merge", "in"
    graph.addInitial "Bar", "Merge", "in"
    graph.addEdge "Merge", "out", "Drop", "in"
    graph

exports["test ArrayPort class"] = (test) ->
    graph = getBaseGraph()
    network = noflo.createNetwork graph, ->
      port = network.processes["Merge"].component.inPorts["in"]
      test.equal port instanceof noflo.ArrayPort, true
      test.equal port.type, 'all'
      test.equal network.processes['Merge'].component.nodeId, 'Merge'
      test.done()

exports["test ArrayPort undefined type"] = (test) ->
    port = new noflo.ArrayPort()
    test.equal port.type, 'all'
    test.done()

exports["test ArrayPort defined type"] = (test) ->
    port = new noflo.ArrayPort 'string'
    test.equal port.type, 'string'
    test.done()

exports["test connecting to ArrayPorts"] = (test) ->
    graph = getBaseGraph()
    network = noflo.createNetwork graph, ->
      test.equal network.connections.length, 3

      port = network.processes["Merge"].component.inPorts["in"]
      test.equal port.sockets.length, 2

      test.done()

exports["test removing ArrayPorts"] = (test) ->
    graph = getBaseGraph()
    network = noflo.createNetwork graph, ->

      port = network.processes["Merge"].component.inPorts["in"]

      first = port.sockets[0]
      port.detach first
      test.equal port.sockets.length, 1

      test.done()
