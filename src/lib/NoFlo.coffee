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

exports.createNetwork = (graph, debug = false, callback) ->
    network = new Network graph
    network.debug = debug

    toAddNodes = graph.nodes.length
    return callback network if toAddNodes is 0

    # Ensure components are loaded before continuing
    network.loader.listComponents ->
        toAdd = graph.edges.length + graph.initializers.length

        connect = ->
            return callback network if toAdd is 0

            for edge in graph.edges
                network.addEdge edge, ->
                    toAdd--
                    callback network if callback? and toAdd is 0

            for initializer in graph.initializers
                network.addInitial initializer, ->
                    toAdd--
                    callback network if callback? and toAdd is 0

        for node in graph.nodes
            network.addNode node, ->
                toAddNodes--
                connect() if toAddNodes is 0

    network

exports.loadFile = (file, success, debug = false) ->
    graph.loadFile file, (net) ->
        exports.createNetwork net, debug, success

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
