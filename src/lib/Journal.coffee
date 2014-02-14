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
    when 'addNode' then "#{a.id}(#{a.component})"
    when 'removeNode' then "DEL #{a.id}(#{a.component})"
    when 'renameNode' then "RENAME #{a.oldId} #{a.newId}"
    when 'addEdge' then "#{a.from.node} #{a.from.port} -> #{a.to.port} #{a.to.node}"
    when 'removeEdge' then "#{a.from.node} #{a.from.port} -X> #{a.to.port} #{a.to.node}"
    when 'addInitial' then "'#{a.from.data}' -> #{a.to.port} #{a.to.node}"
    when 'removeInitial' then "'#{a.from.data}' -X> #{a.to.port} #{a.to.node}"
    when 'startTransaction' then ">>> #{entry.rev}: #{a.id}"
    when 'endTransaction' then "<<< #{entry.rev}: #{a.id}"
    else throw new Error("Unknown journal entry: #{entry.cmd}")


class Journal extends EventEmitter
  graph: null
  entries: []
  subscribed: true # Whether we should respond to graph change notifications or not

  constructor: (graph) ->
    @graph = graph
    @entries = []
    @subscribed = true
    @lastRevision = 0
    @currentRevision = @lastRevision

    # Sync journal with current graph
    @appendCommand 'startTransaction',
        id: 'initial'
        metadata: null
    @appendCommand 'addNode', node for node in @graph.nodes
    @appendCommand 'addEdge', edge for edge in @graph.edges
    @appendCommand 'addIntitial', iip for ipp in @graph.initializers
    @appendCommand 'endTransaction',
      id: 'initial'
      metadata: null

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
    @graph.on 'startTransaction', (id, meta) =>
      return if not @subscribed
      @lastRevision++
      @currentRevision = @lastRevision
      @appendCommand 'startTransaction',
        id: id
        metadata: meta
    @graph.on 'endTransaction', (id, meta) =>
      @appendCommand 'endTransaction',
        id: id
        metadata: meta

  # FIXME: should be called appendEntry/addEntry
  appendCommand: (cmd, args) ->
    return if not @subscribed

    entry =
      cmd: cmd
      args: args
      rev: @lastRevision
    @entries.push(entry)

  executeEntry: (entry) ->
    a = entry.args
    switch entry.cmd
      when 'addNode' then @graph.addNode a.id, a.component
      when 'removeNode' then @graph.removeNode a.id
      when 'renameNode' then @graph.renameNode a.oldId, a.newId
      when 'addEdge' then @graph.addEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'removeEdge' then @graph.removeEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'addInitial' then @graph.addInitial a.from.data, a.to.node, a.to.port
      when 'removeInitial' then @graph.removeInitial a.to.node, a.to.port
      when 'startTransaction' then null
      when 'endTransaction' then null
      else throw new Error("Unknown journal entry: #{entry.cmd}")

  executeEntryInversed: (entry) ->
    a = entry.args
    switch entry.cmd
      when 'addNode' then @graph.removeNode a.id
      when 'removeNode' then @graph.addNode a.id, a.component
      when 'renameNode' then @graph.renameNode a.newId, a.oldId
      when 'addEdge' then @graph.removeEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'removeEdge' then @graph.addEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'addInitial' then @graph.removeInitial a.to.node, a.to.port
      when 'removeInitial' then @graph.addInitial a.from.data, a.to.node, a.to.port
      when 'startTransaction' then null
      when 'endTransaction' then null
      else throw new Error("Unknown journal entry: #{entry.cmd}")

  moveToRevision: (revId) ->
    return if revId == @currentRevision

    @subscribed = false

    if revId > @currentRevision
      # Forward replay journal to revId
      for entry in @entries
        continue if entry.rev <= @currentRevision
        break if entry.rev > revId
        @executeEntry entry

    else
      # Move backwards, and apply inverse changes
      i = @entries.length
      while i > 0
        i--
        entry = @entries[i]
        continue if entry.rev > @currentRevision
        break if entry.rev == revId
        @executeEntryInversed entry
        

    @currentRevision = revId
    @subscribed = true

  undo: () ->
    return unless @currentRevision > 0
    @moveToRevision(@currentRevision-1)

  redo: () ->
    return unless @currentRevision < @lastRevision
    @moveToRevision(@currentRevision+1)

  toPrettyString: (startRev, endRev) ->
    startRev |= 0
    endRev |= @lastRevision
    lines = (entryToPrettyString entry for entry in @entries when entry.rev >= startRev and entry.rev < endRev)
    return lines.join('\n')

  toJSON: () ->
    return @entries

  save: (file, success) ->
    json = JSON.stringify @toJSON(), null, 4
    require('fs').writeFile "#{file}.json", json, "utf-8", (err, data) ->
      throw err if err
      success file

exports.Journal = Journal
