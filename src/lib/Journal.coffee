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

clone = require('./Utils').clone

entryToPrettyString = (entry) ->
  a = entry.args
  return switch entry.cmd
    when 'addNode' then "#{a.id}(#{a.component})"
    when 'removeNode' then "DEL #{a.id}(#{a.component})"
    when 'renameNode' then "RENAME #{a.oldId} #{a.newId}"
    when 'changeNode' then "META #{a.id}(#{a.component})"
    when 'addEdge' then "#{a.from.node} #{a.from.port} -> #{a.to.port} #{a.to.node}"
    when 'removeEdge' then "#{a.from.node} #{a.from.port} -X> #{a.to.port} #{a.to.node}"
    when 'changeEdge' then "META #{a.from.node} #{a.from.port} -> #{a.to.port} #{a.to.node}"
    when 'addInitial' then "'#{a.from.data}' -> #{a.to.port} #{a.to.node}"
    when 'removeInitial' then "'#{a.from.data}' -X> #{a.to.port} #{a.to.node}"
    when 'startTransaction' then ">>> #{entry.rev}: #{a.id}"
    when 'endTransaction' then "<<< #{entry.rev}: #{a.id}"
    when 'changeProperties' then "PROPERTIES"
    when 'addGroup' then "GROUP #{a.name}"
    when 'removeGroup' then "DEL GROUP #{a.name}"
    when 'changeGroup' then "META GROUP #{a.name}"
    when 'addInport' then "INPORT #{a.name}"
    when 'removeInport' then "DEL INPORT #{a.name}"
    when 'renameInport' then "RENAME INPORT #{a.oldId} #{a.newId}"
    when 'changeInport' then "META INPORT #{a.name}"
    when 'addOutport' then "OUTPORT #{a.name}"
    when 'removeOutport' then "DEL OUTPORT #{a.name}"
    when 'renameOutport' then "RENAME OUTPORT #{a.oldId} #{a.newId}"
    when 'changeOutport' then "META OUTPORT #{a.name}"
    else throw new Error("Unknown journal entry: #{entry.cmd}")

# To set, not just update (append) metadata
calculateMeta = (oldMeta, newMeta) ->
  setMeta = {}
  for k, v of oldMeta
    setMeta[k] = null
  for k, v of newMeta
    setMeta[k] = v
  return setMeta


class Journal extends EventEmitter
  graph: null
  entries: []
  subscribed: true # Whether we should respond to graph change notifications or not

  constructor: (graph, metadata) ->
    @graph = graph
    @entries = []
    @subscribed = true
    @lastRevision = 0
    @currentRevision = @lastRevision

    # Sync journal with current graph
    @appendCommand 'startTransaction',
        id: 'initial'
        metadata: metadata
    @appendCommand 'addNode', node for node in @graph.nodes
    @appendCommand 'addEdge', edge for edge in @graph.edges
    @appendCommand 'addInitial', iip for ipp in @graph.initializers
    @appendCommand 'changeProperties', @graph.properties, {} if Object.keys(@graph.properties).length > 0
    @appendCommand 'addInport', {name: k, port: v} for k,v of @graph.inports
    @appendCommand 'addOutport', {name: k, port: v} for k,v of @graph.outports
    @appendCommand 'addGroup', group for group in @graph.groups
    @appendCommand 'endTransaction',
      id: 'initial'
      metadata: metadata


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
    @graph.on 'changeNode', (node, oldMeta) =>
      @appendCommand 'changeNode', {id: node.id, new: node.metadata, old: oldMeta}
    @graph.on 'addEdge', (edge) =>
      @appendCommand 'addEdge', edge
    @graph.on 'removeEdge', (edge) =>
      @appendCommand 'removeEdge', edge
    @graph.on 'changeEdge', (edge) =>
      @appendCommand 'removeEdge', edge
    @graph.on 'addInitial', (iip) =>
      @appendCommand 'addInitial', iip
    @graph.on 'removeInitial', (iip) =>
      @appendCommand 'removeInitial', iip

    @graph.on 'changeProperties', (newProps, oldProps) =>
      @appendCommand 'changeProperties', {new: newProps, old: oldProps}

    @graph.on 'addGroup', (group) =>
      @appendCommand 'addGroup', group
    @graph.on 'removeGroup', (group) =>
      @appendCommand 'removeGroup', group
    @graph.on 'changeGroup', (group, oldMeta) =>
      @appendCommand 'changeGroup', {name: group.name, new: group.metadata, old: oldMeta}

    @graph.on 'addExport', (exported) =>
      @appendCommand 'addExport', exported
    @graph.on 'removeExport', (exported) =>
      @appendCommand 'removeExport', exported

    @graph.on 'addInport', (name, port) =>
      @appendCommand 'addInport', {name: name, port: port}
    @graph.on 'removeInport', (name, port) =>
      @appendCommand 'removeInport', {name: name, port: port}
    @graph.on 'renameInport', (oldId, newId) =>
      @appendCommand 'renameInport', {oldId: oldId, newId: newId}
    @graph.on 'changeInport', (name, port, oldMeta) =>
      @appendCommand 'changeInport', {name: name, new: port.metadata, old: oldMeta}
    @graph.on 'addOutport', (name, port) =>
      @appendCommand 'addOutport', {name: name, port: port}
    @graph.on 'removeOutport', (name, port) =>
      @appendCommand 'removeOutport', {name: name, port: port}
    @graph.on 'renameOutport', (oldId, newId) =>
      @appendCommand 'renameOutport', {oldId: oldId, newId: newId}
    @graph.on 'changeOutport', (name, port, oldMeta) =>
      @appendCommand 'changeOutport', {name: name, new: port.metadata, old: oldMeta}

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
      args: clone args
      rev: @lastRevision
    @entries.push(entry)

  executeEntry: (entry) ->
    a = entry.args
    switch entry.cmd
      when 'addNode' then @graph.addNode a.id, a.component
      when 'removeNode' then @graph.removeNode a.id
      when 'renameNode' then @graph.renameNode a.oldId, a.newId
      when 'changeNode' then @graph.setNodeMetadata a.id, calculateMeta(a.old, a.new)
      when 'addEdge' then @graph.addEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'removeEdge' then @graph.removeEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'addInitial' then @graph.addInitial a.from.data, a.to.node, a.to.port
      when 'removeInitial' then @graph.removeInitial a.to.node, a.to.port
      when 'startTransaction' then null
      when 'endTransaction' then null
      when 'changeProperties' then @graph.setProperties a.new
      when 'addGroup' then @graph.addGroup a.name, a.nodes, a.metadata
      when 'removeGroup' then @graph.removeGroup a.name
      when 'changeGroup' then @graph.setGroupMetadata a.name, calculateMeta(a.old, a.new)
      when 'addInport' then @graph.addInport a.name, a.port.process, a.port.port, a.port.metadata
      when 'removeInport' then @graph.removeInport a.name
      when 'renameInport' then @graph.renameInport a.oldId, a.newId
      when 'changeInport' then @graph.setInportMetadata a.port, calculateMeta(a.old, a.new)
      when 'addOutport' then @graph.addOutport a.name, a.port.process, a.port.port, a.port.metadata a.name
      when 'removeOutport' then @graph.removeOutport
      when 'renameOutport' then @graph.renameOutport a.oldId, a.newId
      when 'changeOutport' then @graph.setOutportMetadata a.port, calculateMeta(a.old, a.new)
      else throw new Error("Unknown journal entry: #{entry.cmd}")

  executeEntryInversed: (entry) ->
    a = entry.args
    switch entry.cmd
      when 'addNode' then @graph.removeNode a.id
      when 'removeNode' then @graph.addNode a.id, a.component
      when 'renameNode' then @graph.renameNode a.newId, a.oldId
      when 'changeNode' then @graph.setNodeMetadata a.id, calculateMeta(a.new, a.old)
      when 'addEdge' then @graph.removeEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'removeEdge' then @graph.addEdge a.from.node, a.from.port, a.to.node, a.to.port
      when 'addInitial' then @graph.removeInitial a.to.node, a.to.port
      when 'removeInitial' then @graph.addInitial a.from.data, a.to.node, a.to.port
      when 'startTransaction' then null
      when 'endTransaction' then null
      when 'changeProperties' then @graph.setProperties a.old
      when 'addGroup' then @graph.removeGroup a.name
      when 'removeGroup' then @graph.addGroup a.name, a.nodes, a.metadata
      when 'changeGroup' then @graph.setGroupMetadata a.name, calculateMeta(a.new, a.old)
      when 'addInport' then @graph.removeInport a.name
      when 'removeInport' then @graph.addInport a.name, a.port.process, a.port.port, a.port.metadata
      when 'renameInport' then @graph.renameInport a.newId, a.oldId
      when 'changeInport' then @graph.setInportMetadata a.port, calculateMeta(a.new, a.old)
      when 'addOutport' then @graph.removeOutport a.name
      when 'removeOutport' then @graph.addOutport a.name, a.port.process, a.port.port, a.port.metadata
      when 'renameOutport' then @graph.renameOutport a.newId, a.oldId
      when 'changeOutport' then @graph.setOutportMetadata a.port, calculateMeta(a.new, a.old)
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
