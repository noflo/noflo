#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013 The Grid
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# NoFlo graphs are Event Emitters, providing signals when the graph
# definition changes.
#
# On Node.js we use the build-in EventEmitter implementation
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  {EventEmitter} = require 'events'
# On browser we use Component's EventEmitter implementation
else
  EventEmitter = require 'emitter'

# This class represents an abstract NoFlo graph containing nodes
# connected to each other with edges.
#
# These graphs can be used for visualization and sketching, but
# also are the way to start a NoFlo network.
class Graph extends EventEmitter
  name: ''
  properties: {}
  nodes: []
  edges: []
  initializers: []
  exports: []
  groups: []

  # ## Creating new graphs
  #
  # Graphs are created by simply instantiating the Graph class
  # and giving it a name:
  #
  #     myGraph = new Graph 'My very cool graph'
  constructor: (@name = '') ->
    @properties = {}
    @nodes = []
    @edges = []
    @initializers = []
    @exports = []
    @groups = []

  # ## Exporting a port from subgraph
  #
  # This allows subgraphs to expose a cleaner API by having reasonably
  # named ports shown instead of all the free ports of the graph
  addExport: (privatePort, publicPort, metadata) ->
    @exports.push
      private: privatePort.toLowerCase()
      public: publicPort.toLowerCase()
      metadata: metadata

  removeExport: (publicPort) ->
    for exported in @exports
      continue unless exported
      continue unless exported.public is publicPort
      @exports.splice @exports.indexOf(exported), 1

  # ## Grouping nodes in a graph
  #
  addGroup: (group, nodes, metadata) ->
    @groups.push
      name: group
      nodes: nodes
      metadata: metadata

  removeGroup: (group) ->
    for group in @groups
      continue unless group
      continue unless group.name is group
      @groups.splice @groups.indexOf(group), 1

  # ## Adding a node to the graph
  #
  # Nodes are identified by an ID unique to the graph. Additionally,
  # a node may contain information on what NoFlo component it is and
  # possible display coordinates.
  #
  # For example:
  #
  #     myGraph.addNode 'Read, 'ReadFile',
  #       x: 91
  #       y: 154
  #
  # Addition of a node will emit the `addNode` event.
  addNode: (id, component, metadata) ->
    metadata = {} unless metadata
    node =
      id: id
      component: component
      metadata: metadata
    @nodes.push node
    @emit 'addNode', node
    node

  # ## Removing a node from the graph
  #
  # Existing nodes can be removed from a graph by their ID. This
  # will remove the node and also remove all edges connected to it.
  #
  #     myGraph.removeNode 'Read'
  #
  # Once the node has been removed, the `removeNode` event will be
  # emitted.
  removeNode: (id) ->
    node = @getNode id

    for edge in @edges
      continue unless edge
      if edge.from.node is node.id
        @removeEdge edge.from.node, edge.from.port
      if edge.to.node is node.id
        @removeEdge edge.to.node, edge.to.port

    for initializer in @initializers
      continue unless initializer
      if initializer.to.node is node.id
        @removeInitial initializer.to.node, initializer.to.port

    for exported in @exports
      continue unless exported
      [privateNode, privatePort] = exported.private.split '.'
      if privateNode is id.toLowerCase()
        @removeExport exported.public

    for group in @groups
      continue unless group
      index = group.nodes.indexOf(id) is -1
      continue if index is -1
      group.nodes.splice index, 1

    if -1 isnt @nodes.indexOf node
      @nodes.splice @nodes.indexOf(node), 1

    @emit 'removeNode', node

  # ## Getting a node
  #
  # Nodes objects can be retrieved from the graph by their ID:
  #
  #     myNode = myGraph.getNode 'Read'
  getNode: (id) ->
    for node in @nodes
      continue unless node
      return node if node.id is id
    return null

  # ## Renaming a node
  #
  # Nodes IDs can be changed by calling this method.
  renameNode: (oldId, newId) ->
    node = @getNode oldId
    return unless node
    node.id = newId

    for edge in @edges
      continue unless edge
      if edge.from.node is oldId
        edge.from.node = newId
      if edge.to.node is oldId
        edge.to.node = newId

    for iip in @initializers
      continue unless iip
      if iip.to.node is oldId
        iip.to.node = newId

    for exported in @exports
      continue unless exported
      [privateNode, privatePort] = exported.private.split '.'
      continue unless privateNode is oldId.toLowerCase()
      exported.private = "#{newId.toLowerCase()}.#{privatePort}"

    for group in @groups
      continue unless group
      index = group.nodes.indexOf(oldId)
      continue if index is -1
      group.nodes[index] = newId

    @emit 'renameNode', oldId, newId

  # ## Connecting nodes
  #
  # Nodes can be connected by adding edges between a node's outport
  # and another node's inport:
  #
  #     myGraph.addEdge 'Read', 'out', 'Display', 'in'
  #
  # Adding an edge will emit the `addEdge` event.
  addEdge: (outNode, outPort, inNode, inPort, metadata) ->
    return unless @getNode outNode
    return unless @getNode inNode
    metadata = {} unless metadata
    edge =
      from:
        node: outNode
        port: outPort
      to:
        node: inNode
        port: inPort
      metadata: metadata
    @edges.push edge
    @emit 'addEdge', edge
    edge

  # ## Disconnected nodes
  #
  # Connections between nodes can be removed by providing the
  # node and port to disconnect. The specified node and port can
  # be either the outport or the inport of the connection:
  #
  #     myGraph.removeEdge 'Read', 'out'
  #
  # or:
  #
  #     myGraph.removeEdge 'Display', 'in', 'Foo', 'out'
  #
  # Removing a connection will emit the `removeEdge` event.
  removeEdge: (node, port, node2, port2) ->
    for edge,index in @edges
      continue unless edge
      if edge.from.node is node and edge.from.port is port
        if node2 and port2
          unless edge.to.node is node2 and edge.to.port is port2
            continue
        @emit 'removeEdge', edge
        @edges.splice index, 1
      if edge.to.node is node and edge.to.port is port
        if node2 and port2
          unless edge.from.node is node2 and edge.from.port is port2
            continue
        @emit 'removeEdge', edge
        @edges.splice index, 1

  # ## Adding Initial Information Packets
  #
  # Initial Information Packets (IIPs) can be used for sending data
  # to specified node inports without a sending node instance.
  #
  # IIPs are especially useful for sending configuration information
  # to components at NoFlo network start-up time. This could include
  # filenames to read, or network ports to listen to.
  #
  #     myGraph.addInitial 'somefile.txt', 'Read', 'source'
  #
  # Adding an IIP will emit a `addInitial` event.
  addInitial: (data, node, port, metadata) ->
    return unless @getNode node
    initializer =
      from:
        data: data
      to:
        node: node
        port: port
      metadata: metadata
    @initializers.push initializer
    @emit 'addInitial', initializer
    initializer

  # ## Removing Initial Information Packets
  #
  # IIPs can be removed by calling the `removeInitial` method.
  #
  #     myGraph.removeInitial 'Read', 'source'
  #
  # Remove an IIP will emit a `removeInitial` event.
  removeInitial: (node, port) ->
    for edge, index in @initializers
      continue unless edge
      if edge.to.node is node and edge.to.port is port
        @emit 'removeInitial', edge
        @initializers.splice index, 1

  toDOT: ->
    cleanID = (id) ->
      id.replace /\s*/g, ""
    cleanPort = (port) ->
      port.replace /\./g, ""

    dot = "digraph {\n"

    for node in @nodes
      dot += "    #{cleanID(node.id)} [label=#{node.id} shape=box]\n"

    for initializer, id in @initializers
      if typeof initializer.from.data is 'function'
        data = 'Function'
      else
        data = initializer.from.data
      dot += "    data#{id} [label=\"'#{data}'\" shape=plaintext]\n"
      dot += "    data#{id} -> #{cleanID(initializer.to.node)}[headlabel=#{cleanPort(initializer.to.port)} labelfontcolor=blue labelfontsize=8.0]\n"

    for edge in @edges
      dot += "    #{cleanID(edge.from.node)} -> #{cleanID(edge.to.node)}[taillabel=#{cleanPort(edge.from.port)} headlabel=#{cleanPort(edge.to.port)} labelfontcolor=blue labelfontsize=8.0]\n"

    dot += "}"

    return dot

  toYUML: ->
    yuml = []

    for initializer in @initializers
      yuml.push "(start)[#{initializer.to.port}]->(#{initializer.to.node})"

    for edge in @edges
      yuml.push "(#{edge.from.node})[#{edge.from.port}]->(#{edge.to.node})"
    yuml.join ","

  toJSON: ->
    json =
      properties: {}
      exports: []
      groups: []
      processes: {}
      connections: []

    json.properties.name = @name if @name
    for property, value of @properties
      json.properties[property] = value

    for exported in @exports
      exportedData =
        public: exported.public
        private: exported.private
      if exported.metadata
        exportedData.metadata = exported.metadata
      json.exports.push exportedData

    for group in @groups
      groupData =
        name: group.name
        nodes: group.nodes
      if group.metadata
        groupData.metadata = group.metadata
      json.groups.push groupData

    for node in @nodes
      json.processes[node.id] =
        component: node.component
      if node.metadata
        json.processes[node.id].metadata = node.metadata

    for edge in @edges
      connection =
        src:
          process: edge.from.node
          port: edge.from.port
        tgt:
          process: edge.to.node
          port: edge.to.port
      connection.metadata = edge.metadata if Object.keys(edge.metadata).length
      json.connections.push connection

    for initializer in @initializers
      json.connections.push
        data: initializer.from.data
        tgt:
          process: initializer.to.node
          port: initializer.to.port

    json

  save: (file, success) ->
    json = JSON.stringify @toJSON(), null, 4
    require('fs').writeFile "#{file}.json", json, "utf-8", (err, data) ->
      throw err if err
      success file

exports.Graph = Graph

exports.createGraph = (name) ->
  new Graph name

exports.loadJSON = (definition, success) ->
  definition.properties = {} unless definition.properties
  definition.processes = {} unless definition.processes
  definition.connections = [] unless definition.connections

  graph = new Graph definition.properties.name
  for property, value of definition.properties
    continue if property is 'name'
    graph.properties[property] = value

  for id, def of definition.processes
    def.metadata = {} unless def.metadata
    graph.addNode id, def.component, def.metadata

  for conn in definition.connections
    if conn.data isnt undefined
      graph.addInitial conn.data, conn.tgt.process, conn.tgt.port.toLowerCase()
      continue
    metadata = if conn.metadata then conn.metadata else {}
    graph.addEdge conn.src.process, conn.src.port.toLowerCase(), conn.tgt.process, conn.tgt.port.toLowerCase(), metadata

  if definition.exports
    for exported in definition.exports
      graph.addExport exported.private, exported.public, exported.metadata

  if definition.groups
    for group in definition.groups
      graph.addGroup group.name, group.nodes, group.metadata

  success graph

exports.loadFBP = (fbpData, success) ->
  definition = require('fbp').parse fbpData
  exports.loadJSON definition, success

exports.loadHTTP = (url, success) ->
  req = new XMLHttpRequest
  req.onreadystatechange = ->
    return unless req.readyState is 4
    return success() unless req.status is 200
    success req.responseText
  req.open 'GET', url, true
  req.send()

exports.loadFile = (file, success) ->
  unless typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
    try
      # Graph exposed via Component packaging
      definition = require file
      exports.loadJSON definition, success
      return
    catch e
      # Graph available via HTTP
      exports.loadHTTP file, (data) ->
        unless data
          throw new Error "Failed to load graph #{file}"
          return
        if file.split('.').pop() is 'fbp'
          return exports.loadFBP data, success
        definition = JSON.parse data
        exports.loadJSON definition, success
    return
  # Node.js graph file
  require('fs').readFile file, "utf-8", (err, data) ->
    throw err if err

    if file.split('.').pop() is 'fbp'
      return exports.loadFBP data, success

    definition = JSON.parse data
    exports.loadJSON definition, success
