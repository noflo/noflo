#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2018 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
BaseNetwork = require './BaseNetwork'
{ deprecated } = require './Platform'

# ## The NoFlo network coordinator
#
# NoFlo networks consist of processes connected to each other
# via sockets attached from outports to inports.
#
# The role of the network coordinator is to take a graph and
# instantiate all the necessary processes from the designated
# components, attach sockets between them, and handle the sending
# of Initial Information Packets.
class LegacyNetwork extends BaseNetwork
  # All NoFlo networks are instantiated with a graph. Upon instantiation
  # they will load all the needed components, instantiate them, and
  # set up the defined connections and IIPs.
  #
  # The legacy network will also listen to graph changes and modify itself
  # accordingly, including removing connections, adding new nodes,
  # and sending new IIPs.
  constructor: (graph, options = {}) ->
    deprecated 'noflo.Network construction is deprecated, use noflo.createNetwork'
    super graph, options

  connect: (done = ->) ->
    super (err) =>
      return done err if err
      @subscribeGraph()
      done()

  # A NoFlo graph may change after network initialization.
  # For this, the legacy network subscribes to the change events
  # from the graph.
  #
  # In graph we talk about nodes and edges. Nodes correspond
  # to NoFlo processes, and edges to connections between them.
  subscribeGraph: ->
    graphOps = []
    processing = false
    registerOp = (op, details) ->
      graphOps.push
        op: op
        details: details
    processOps = (err) =>
      if err
        throw err if @listeners('process-error').length is 0
        @bufferedEmit 'process-error', err

      unless graphOps.length
        processing = false
        return
      processing = true
      op = graphOps.shift()
      cb = processOps
      switch op.op
        when 'renameNode'
          @renameNode op.details.from, op.details.to, cb
        else
          @[op.op] op.details, cb

    @graph.on 'addNode', (node) ->
      registerOp 'addNode', node
      do processOps unless processing
    @graph.on 'removeNode', (node) ->
      registerOp 'removeNode', node
      do processOps unless processing
    @graph.on 'renameNode', (oldId, newId) ->
      registerOp 'renameNode',
        from: oldId
        to: newId
      do processOps unless processing
    @graph.on 'addEdge', (edge) ->
      registerOp 'addEdge', edge
      do processOps unless processing
    @graph.on 'removeEdge', (edge) ->
      registerOp 'removeEdge', edge
      do processOps unless processing
    @graph.on 'addInitial', (iip) ->
      registerOp 'addInitial', iip
      do processOps unless processing
    @graph.on 'removeInitial', (iip) ->
      registerOp 'removeInitial', iip
      do processOps unless processing

exports.Network = LegacyNetwork
