noflo = require "noflo"

getBaseGraph = ->
    graph = new noflo.Graph "ArrayPort"
    graph.addNode "Display", "Output"
    graph.addInitial "Foo", "Display", "in"
    graph.addInitial "Bar", "Display", "in"
    graph

exports["test ArrayPort type"] = (test) ->
    graph = getBaseGraph()
    network = noflo.createNetwork graph, false, ->
      port = network.processes["Display"].component.inPorts["in"]
      test.equal port instanceof noflo.ArrayPort, true
      test.done()

exports["test connecting to ArrayPorts"] = (test) ->
    graph = getBaseGraph()
    network = noflo.createNetwork graph, false, ->
      test.equal network.connections.length, 2

      port = network.processes["Display"].component.inPorts["in"]
      test.equal port.sockets.length, 2

      test.done()

exports["test removing ArrayPorts"] = (test) ->
    graph = getBaseGraph()
    network = noflo.createNetwork graph, false, ->

      port = network.processes["Display"].component.inPorts["in"]

      first = port.sockets[0]
      port.detach first
      test.equal port.sockets.length, 1

      test.done()
