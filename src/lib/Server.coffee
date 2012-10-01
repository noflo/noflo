express = require "express"
noflo = require "noflo"
path = require "path"
nofloRoot = path.normalize "#{__dirname}/.."

prepareNetwork = (network, id) ->
  cleanNetwork =
    id: id
    name: network.graph.name
    started: network.startupDate
    nodes: []
    edges: []

  for name, node of network.graph.nodes
    cleanNetwork.nodes.push prepareNode node, network

  combined = network.graph.edges.concat network.graph.initializers
  for edge, index in combined
    cleanNetwork.edges.push prepareEdge edge, index

  cleanNetwork

prepareNode = (node, network) ->
  process = network.getNode node.id
  cleanNode =
    id: node.id
    cleanId: node.id.replace " ", "_"
    display: node.display
    inPorts: []
    outPorts: []
  for name, port of process.component.inPorts
    cleanNode.inPorts.push preparePort port, name
  for name, port of process.component.outPorts
    cleanNode.outPorts.push preparePort port, name
  cleanNode

prepareEdge = (edge, index) ->
  cleanEdge =
    id: index + 1
    to: edge.to
    from: edge.from
  cleanEdge.to.cleanNode = edge.to.node.replace " ", "_"
  if edge.from.node
    cleanEdge.from.cleanNode = edge.from.node.replace " ", "_"
  cleanEdge

preparePort = (port, name) ->
  cleanPort =
    name: name
    type: "single"
  if port instanceof noflo.ArrayPort
    cleanPort.type = "array"
  cleanPort

exports.createServer = (port, success) ->
  staticDir = "#{nofloRoot}/server/static"
  sourceDir = "#{nofloRoot}/server/src"

  app = express.createServer()
  app.networks = []
  app.use express.compiler
    src: sourceDir
    dest: staticDir
    enable: ['coffeescript']
  app.use express.static staticDir
  app.use express.bodyParser()
  app.set "view engine", "jade"
  app.set "view options",
    layout: false
  app.set "views", "#{nofloRoot}/server/views"

  app.get "/", (req, res) ->
    res.render "application", {}

  app.get "/network", (req, res) ->
    results = []
    for network, id in app.networks
      results.push prepareNetwork network, id
    res.send results

  app.param "network_id", (req, res, next, id) ->
    unless app.networks[id]
      return res.send "No network '#{id}' found", 404

    req.network = prepareNetwork app.networks[id], id
    next()

  app.param "node_id", (req, res, next, id) ->
    for node in req.network.nodes
      unless id is node.id
        continue
      req.node = node
      return next()
    res.send "No node '#{id}' found", 404

  app.param "edge_id", (req, res, next, id) ->
    index = id - 1
    unless req.network.edges[index]
      return res.send "No edge '#{id}' found", 404
    req.edge = req.network.edges[index]
    next()

  app.get "/network/:network_id", (req, res) ->
    res.send req.network

  app.get "/network/:network_id/node", (req, res) ->
    res.send req.network.nodes

  app.post "/network/:network_id/node", (req, res) ->
    unless req.body.id and req.body.component
      return res.send "Missing ID or component definition", 422

    app.networks[req.network.id].graph.addNode req.body.id, req.body.component
    res.header "Location", "/network/#{req.params.network_id}/node/#{req.body.id}"
    res.send null, 201

  app.get "/network/:network_id/node/:node_id", (req, res) ->
    res.send req.node

  app.put "/network/:network_id/node/:node_id", (req, res) ->
    if req.body.display
      for node, index in app.networks[req.network.id].graph.nodes
        continue unless node.id is req.node.id
        node.display = req.body.display
        req.node = prepareNode node, app.networks[req.network.id]
    res.send req.node

  app.delete "/network/:network_id/node/:node_id", (req, res) ->
    app.networks[req.network.id].graph.removeNode req.node.id
    res.send req.node

  app.get "/network/:network_id/edge", (req, res) ->
    res.send req.network.edges

  app.post "/network/:network_id/edge", (req, res) ->
    unless req.body.to
      return res.send "Missing target for connection", 422
    unless req.body.to.node
      return res.send "Missing target node", 422
    unless req.body.to.port
      return res.send "Missing target port", 422

    if req.body.data
      app.networks[req.network.id].graph.addInitial req.body.data, req.body.to.node, req.body.to.process
      return res.send null, 201

    unless req.body.from
      return res.send "Missing source for connection", 422
    unless req.body.from.node
      return res.send "Missing source node", 422
    unless req.body.from.port
      return res.send "Missing source port", 422

    app.networks[req.network.id].addEdge req.body.from.node, req.body.from.port, req.body.to.node, req.body.to.port
    res.send null, 201

  app.get "/network/:network_id/edge/:edge_id", (req, res) ->
    res.send req.edge

  app.delete "/network/:network_id/edge/:edge_id", (req, res) ->
    if req.edge.from
      app.networks[req.network.id].graph.removeEdge req.edge.from.node, req.edge.from.port
      return res.send req.edge
    app.networks[req.network.id].graph.removeEdge req.edge.to.node, req.edge.to.port
    res.send req.edge

  app.listen port, null, ->
    success app
