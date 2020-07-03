#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2018 Flowhub UG
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
BaseNetwork = require './BaseNetwork'

# ## The NoFlo network coordinator
#
# NoFlo networks consist of processes connected to each other
# via sockets attached from outports to inports.
#
# The role of the network coordinator is to take a graph and
# instantiate all the necessary processes from the designated
# components, attach sockets between them, and handle the sending
# of Initial Information Packets.
class Network extends BaseNetwork
  # All NoFlo networks are instantiated with a graph. Upon instantiation
  # they will load all the needed components, instantiate them, and
  # set up the defined connections and IIPs.
  constructor: (graph, options = {}) ->
    super graph, options

  # Add a process to the network. The node will also be registered
  # with the current graph.
  addNode: (node, options, callback) ->
    if typeof options is 'function'
      callback = options
      options = {}
    super node, options, (err, process) =>
      if err
        callback err
        return
      unless options.initial
        @graph.addNode node.id, node.component, node.metadata
      callback null, process
      return
    return

  # Remove a process from the network. The node will also be removed
  # from the current graph.
  removeNode: (node, callback) ->
    super node, (err) =>
      if err
        callback err
        return
      @graph.removeNode node.id
      callback()
      return
    return

  # Rename a process in the network. Renaming a process also modifies
  # the current graph.
  renameNode: (oldId, newId, callback) ->
    super oldId, newId, (err) =>
      if err
        callback err
        return
      @graph.renameNode oldId, newId
      callback()
      return
    return

  # Add a connection to the network. The edge will also be registered
  # with the current graph.
  addEdge: (edge, options, callback) ->
    if typeof options is 'function'
      callback = options
      options = {}
    super edge, options, (err) =>
      if err
        callback err
        return
      unless options.initial
        @graph.addEdgeIndex edge.from.node, edge.from.port, edge.from.index, edge.to.node, edge.to.port, edge.to.index, edge.metadata
      callback()
      return
    return

  # Remove a connection from the network. The edge will also be removed
  # from the current graph.
  removeEdge: (edge, callback) ->
    super edge, (err) =>
      if err
        callback err
        return
      @graph.removeEdge edge.from.node, edge.from.port, edge.to.node, edge.to.port
      callback()
      return
    return

  # Add an IIP to the network. The IIP will also be registered with the
  # current graph. If the network is running, the IIP will be sent immediately.
  addInitial: (iip, options, callback) ->
    if typeof options is 'function'
      callback = options
      options = {}
    super iip, options, (err) =>
      if err
        callback err
        return
      unless options.initial
        @graph.addInitialIndex iip.from.data, iip.to.node, iip.to.port, iip.to.index, iip.metadata
      callback()
      return
    return

  # Remove an IIP from the network. The IIP will also be removed from the
  # current graph.
  removeInitial: (iip, callback) ->
    super iip, (err) =>
      if err
        callback err
        return
      @graph.removeInitial iip.to.node, iip.to.port
      callback()
      return
    return

exports.Network = Network
