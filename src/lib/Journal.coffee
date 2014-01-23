#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 Jon Nordby
#     (c) 2013 The Grid
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#

# On Node.js we use the build-in EventEmitter implementation
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  {EventEmitter} = require 'events'
# On browser we use Component's EventEmitter implementation
else
  EventEmitter = require 'emitter'

entryToPrettyString = (entry) ->
  a = entry.args
  return switch entry.cmd
    when 'initialize' then "INIT"
    when 'addNode' then "#{a.id}(#{a.component})"
    when 'removeNode' then "DEL #{a.id}(#{a.component})"
    when 'renameNode' then "RENAME #{a.oldId} #{a.newId}"
    when 'addEdge' then "#{a.from.node} #{a.from.port} -> #{a.to.port} #{a.to.node}"
    when 'removeEdge' then "#{a.from.node} #{a.from.port} -X> #{a.to.port} #{a.to.node}"
    when 'addInitial' then "'#{a.from.data}' -> #{a.to.port} #{a.to.node}"
    when 'removeInitial' then "'#{a.from.data}' -X> #{a.to.port} #{a.to.node}"
    else throw new Error("Unknown journal entry: #{entry.cmd}")


class Journal extends EventEmitter
  graph: null
  entries: []
  subscribed: true # Whether we should respond to graph change notifications or not

  constructor: (graph) ->
    @graph = graph
    @entries = []
    @subscribed = true

    @appendCommand 'initialize'

    # TODO: group into an initial transaction?
    # Sync journal with current graph
    @appendCommand 'addNode', node for node in @graph.nodes
    @appendCommand 'addEdge', edge for edge in @graph.edges
    @appendCommand 'addIntitial', iip for ipp in @graph.initializers

    # Subscribe to graph changes
    @graph.on 'addNode', (node) =>
      @appendCommand 'addNode', node
    @graph.on 'removeNode', (node) =>
      @appendCommand 'removeNode', node
    @graph.on 'renameNode', (oldId, newId) =>
      args =
        oldId: oldId
        newId: newId
      @appendCommand 'renameNode', args
    @graph.on 'addEdge', (edge) =>
      @appendCommand 'addEdge', edge
    @graph.on 'removeEdge', (edge) =>
      @appendCommand 'removeEdge', edge
    @graph.on 'addInitial', (iip) =>
      @appendCommand 'addInitial', iip
    @graph.on 'removeInitial', (iip) =>
      @appendCommand 'removeInitial', iip

  appendCommand: (cmd, args) ->
    if not @subscribed
      return

    entry =
      cmd: cmd
      args: args
    @entries.push(entry)

  executeEntry: (entry) ->
    a = entry.args
    switch entry.cmd
      when 'initialize' then null
      when 'addNode' then @graph.addNode a.id, a.component
      when 'removeNode' then @graph.removeNode a.id
      when 'renameNode' then @graph.renameNode a.oldId, a.newId
      when 'addEdge' then @graph.addEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'removeEdge' then @graph.removeEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'addInitial' then @graph.addInitial a.from.data, a.to.node, a.to.port
      when 'removeInitial' then @graph.removeInitial a.to.node, a.to.port
      else throw new Error("Unknown journal entry: #{entry.cmd}")

  moveToRevision: (revId) ->
    # TODO: calculate difference between current state and desired state at revId,
    # then generate the minimum change list to get there

    @subscribed = false

    # For now, clear the entire graph
    nodes = (n for n in @graph.nodes)
    for node in nodes
      @graph.removeNode node.id

    # Then replay journal to revId
    for entry in @entries[0..revId]
      @executeEntry entry

    @subscribed = true

  toPrettyString: () ->
    lines = (entryToPrettyString entry for entry in @entries)
    return lines.join('\n')

  toJSON: () ->
    return @entries

  save: (file, success) ->
    json = JSON.stringify @toJSON(), null, 4
    require('fs').writeFile "#{file}.json", json, "utf-8", (err, data) ->
      throw err if err
      success file

exports.Journal = Journal
