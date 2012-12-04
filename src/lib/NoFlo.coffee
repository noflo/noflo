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
{Network} = require "./Network"

exports.createNetwork = (graph, callback) ->
  network = new Network graph

  networkReady = (network) ->
    callback network
    network.sendInitials()

  toAddNodes = graph.nodes.length
  return networkReady network if toAddNodes is 0

  # Ensure components are loaded before continuing
  network.loader.listComponents ->
    toAdd = graph.edges.length + graph.initializers.length

    connect = ->
      return networkReady network if toAdd is 0

      for edge in graph.edges
        network.addEdge edge, ->
          toAdd--
          networkReady network if callback? and toAdd is 0

      for initializer in graph.initializers
        network.addInitial initializer, ->
          toAdd--
          networkReady network if callback? and toAdd is 0

    for node in graph.nodes
      network.addNode node, ->
        toAddNodes--
        connect() if toAddNodes is 0

  network

exports.loadFile = (file, callback) ->
  graph.loadFile file, (net) ->
    exports.createNetwork net, callback

exports.saveFile = (graph, file, callback) ->
  graph.save file, -> callback file

exports.Component = component.Component
exports.ComponentLoader = componentLoader.ComponentLoader
exports.AsyncComponent = asynccomponent.AsyncComponent
exports.Port = port.Port
exports.ArrayPort = arrayport.ArrayPort
exports.Graph = graph.Graph
exports.graph = graph
exports.internalSocket = internalSocket
