express = require "express"
noflo = require "noflo"
nofloRoot = "#{__dirname}/.."

exports.createServer = (port, success) ->

    app = express.createServer()
    app.networks = []
    app.use "/static", express.static "#{nofloRoot}/static"

    app.get "/", (req, res) ->
        res.send "Hello, there"

    app.param "network_id", (req, res, next, id) ->
        unless app.networks[id]
          return res.send "No network '#{id}' found", 404

        req.network = app.networks[id]
        next()

    app.param "node_id", (req, res, next, id) ->
        for node in req.network.graph.nodes
            unless id is node.id
                continue
            req.node = node
            return next()
        res.send "No node '#{id}' found", 404

    app.param "edge_id", (req, res, next, id) ->
        combined = req.network.graph.edges.concat req.network.graph.initializers
        unless combined[id]
          return res.send "No edge '#{id}' found", 404
        req.edge = combined[id]
        next()

    app.get "/network/:network_id", (req, res) ->
        network =
            name: req.network.graph.name
            nodes: req.network.graph.nodes
            edges: req.network.graph.edges.concat req.network.graph.initializers
        res.send network

    app.get "/network/:network_id/node", (req, res) ->
        res.send req.network.graph.nodes

    app.post "/network/:network_id/node", (req, res) ->
        unless req.body.id and req.body.component
            return res.send "Missing ID or component definition", 422

        req.network.graph.addNode req.body.id, req.body.component
        res.header "Location", "/network/#{req.params.network_id}/node/#{req.body.id}"
        res.send null, 201

    app.get "/network/:network_id/node/:node_id", (req, res) ->
        res.send req.node

    app.delete "/network/:network_id/node/:node_id", (req, res) ->
        req.network.graph.removeNode req.node.id
        res.send req.node

    app.get "/network/:network_id/edge", (req, res) ->
        res.send req.network.graph.edges.concat req.network.graph.initializers

    app.post "/network/:network_id/edge", (req, res) ->
        unless req.body.to
            return res.send "Missing target for connection", 422
        unless req.body.to.node
            return res.send "Missing target node", 422
        unless req.body.to.port
            return res.send "Missing target port", 422

        if req.body.data
            req.network.graph.addInitial req.body.data, req.body.to.node, req.body.to.process
            return res.send null, 201

        unless req.body.from
            return res.send "Missing source for connection", 422
        unless req.body.from.node
            return res.send "Missing source node", 422
        unless req.body.from.port
            return res.send "Missing source port", 422

        req.network.addEdge req.body.from.node, req.body.from.port, req.body.to.node, req.body.to.port
        res.send null, 201

    app.get "/network/:network_id/edge/:edge_id", (req, res) ->
        res.send req.edge

    app.delete "/network/:network_id/edge/:edge_id", (req, res) ->
        if req.edge.from
            req.network.graph.removeEdge req.edge.from.node, req.edge.from.port
            return res.send req.edge
        req.network.graph.removeEdge req.edge.to.node, req.edge.to.port
        res.send req.edge

    app.listen port, null, ->
        success app
