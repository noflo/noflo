#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2011 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
internalSocket = require "./InternalSocket"
component = require "./Component"
asynccomponent = require "./AsyncComponent"
port = require "./Port"
arrayport = require "./ArrayPort"
graph = require "./Graph"
{Network} = require "./Network"
{LoggingComponent} = require "./LoggingComponent"

if typeof process is 'object' and process.title is 'node'
  componentLoader = require "./nodejs/ComponentLoader"
else
  componentLoader = require './ComponentLoader'

exports.createNetwork = (graph, callback) ->
  network = new Network graph

  networkReady = (network) ->
    callback network if callback?
    network.sendInitials()

  if graph.nodes.length is 0
    setTimeout ->
      networkReady network
    , 0
    return network

  # Ensure components are loaded before continuing
  network.loader.listComponents ->
    network.connect ->
      networkReady network

  network

exports.loadFile = (file, callback) ->
  graph.loadFile file, (net) ->
    exports.createNetwork net, callback

exports.saveFile = (graph, file, callback) ->
  graph.save file, -> callback file

exports.Component = component.Component
exports.ComponentLoader = componentLoader.ComponentLoader
exports.AsyncComponent = asynccomponent.AsyncComponent
exports.LoggingComponent = LoggingComponent
exports.Port = port.Port
exports.ArrayPort = arrayport.ArrayPort
exports.Graph = graph.Graph
exports.Network = Network
exports.graph = graph
exports.internalSocket = internalSocket
