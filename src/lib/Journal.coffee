#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 Jon Nordby
#     (c) 2013 TheGrid (Rituwall Inc.)
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#

{EventEmitter} = require 'events'

clone = require('./Utils').clone

entryToPrettyString = (entry) ->
  a = entry.args
  return switch entry.cmd
    when 'addNode' then "#{a.id}(#{a.component})"
    when 'removeNode' then "DEL #{a.id}(#{a.component})"
    when 'renameNode' then "RENAME #{a.oldId} #{a.newId}"
    when 'changeNode' then "META #{a.id}"
    when 'addEdge' then "#{a.from.node} #{a.from.port} -> #{a.to.port} #{a.to.node}"
    when 'removeEdge' then "#{a.from.node} #{a.from.port} -X> #{a.to.port} #{a.to.node}"
    when 'changeEdge' then "META #{a.from.node} #{a.from.port} -> #{a.to.port} #{a.to.node}"
    when 'addInitial' then "'#{a.from.data}' -> #{a.to.port} #{a.to.node}"
    when 'removeInitial' then "'#{a.from.data}' -X> #{a.to.port} #{a.to.node}"
    when 'startTransaction' then ">>> #{entry.rev}: #{a.id}"
    when 'endTransaction' then "<<< #{entry.rev}: #{a.id}"
    when 'changeProperties' then "PROPERTIES"
    when 'addGroup' then "GROUP #{a.name}"
    when 'renameGroup' then "RENAME GROUP #{a.oldName} #{a.newName}"
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


class JournalStore extends EventEmitter
  lastRevision: 0
  constructor: (@graph) ->
    @lastRevision = 0
  putTransaction: (revId, entries) ->
    @lastRevision = revId if revId > @lastRevision
    @emit 'transaction', revId
  fetchTransaction: (revId, entries) ->

class MemoryJournalStore extends JournalStore
  constructor: (graph) ->
    super graph
    @transactions = []

  putTransaction: (revId, entries) ->
    super revId, entries
    @transactions[revId] = entries

  fetchTransaction: (revId) ->
    return @transactions[revId]

# ## Journalling graph changes
#
# The Journal can follow graph changes, store them
# and allows to recall previous revisions of the graph.
#
# Revisions stored in the journal follow the transactions of the graph.
# It is not possible to operate on smaller changes than individual transactions.
# Use startTransaction and endTransaction on Graph to structure the revisions logical changesets.
class Journal extends EventEmitter
  graph: null
  entries: [] # Entries added during this revision
  subscribed: true # Whether we should respond to graph change notifications or not

  constructor: (graph, metadata, store) ->
    @graph = graph
    @entries = []
    @subscribed = true
    @store = store || new MemoryJournalStore @graph

    if @store.transactions.length is 0
      # Sync journal with current graph to start transaction history
      @currentRevision = -1
      @startTransaction 'initial', metadata
      @appendCommand 'addNode', node for node in @graph.nodes
      @appendCommand 'addEdge', edge for edge in @graph.edges
      @appendCommand 'addInitial', iip for iip in @graph.initializers
      @appendCommand 'changeProperties', @graph.properties, {} if Object.keys(@graph.properties).length > 0
      @appendCommand 'addInport', {name: k, port: v} for k,v of @graph.inports
      @appendCommand 'addOutport', {name: k, port: v} for k,v of @graph.outports
      @appendCommand 'addGroup', group for group in @graph.groups
      @endTransaction 'initial', metadata
    else
      # Persistent store, start with its latest rev
      @currentRevision = @store.lastRevision

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
    @graph.on 'changeEdge', (edge, oldMeta) =>
      @appendCommand 'changeEdge', {from: edge.from, to: edge.to, new: edge.metadata, old: oldMeta}
    @graph.on 'addInitial', (iip) =>
      @appendCommand 'addInitial', iip
    @graph.on 'removeInitial', (iip) =>
      @appendCommand 'removeInitial', iip

    @graph.on 'changeProperties', (newProps, oldProps) =>
      @appendCommand 'changeProperties', {new: newProps, old: oldProps}

    @graph.on 'addGroup', (group) =>
      @appendCommand 'addGroup', group
    @graph.on 'renameGroup', (oldName, newName) =>
      @appendCommand 'renameGroup',
        oldName: oldName
        newName: newName
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
      @startTransaction id, meta
    @graph.on 'endTransaction', (id, meta) =>
      @endTransaction id, meta

  startTransaction: (id, meta) =>
    return if not @subscribed
    if @entries.length > 0
      throw Error("Inconsistent @entries")
    @currentRevision++
    @appendCommand 'startTransaction', {id: id, metadata: meta}, @currentRevision

  endTransaction: (id, meta) =>
    return if not @subscribed

    @appendCommand 'endTransaction', {id: id, metadata: meta}, @currentRevision
    # TODO: this would be the place to refine @entries into
    # a minimal set of changes, like eliminating changes early in transaction
    # which were later reverted/overwritten
    @store.putTransaction @currentRevision, @entries
    @entries = []

  appendCommand: (cmd, args, rev) ->
    return if not @subscribed

    entry =
      cmd: cmd
      args: clone args
    entry.rev = rev if rev?
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
      when 'changeEdge' then @graph.setEdgeMetadata a.from.node, a.from.port, a.to.node, a.to.port, calculateMeta(a.old, a.new)
      when 'addInitial' then @graph.addInitial a.from.data, a.to.node, a.to.port
      when 'removeInitial' then @graph.removeInitial a.to.node, a.to.port
      when 'startTransaction' then null
      when 'endTransaction' then null
      when 'changeProperties' then @graph.setProperties a.new
      when 'addGroup' then @graph.addGroup a.name, a.nodes, a.metadata
      when 'renameGroup' then @graph.renameGroup a.oldName, a.newName
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
      when 'changeEdge' then @graph.setEdgeMetadata a.from.node, a.from.port, a.to.node, a.to.port, calculateMeta(a.new, a.old)
      when 'addInitial' then @graph.removeInitial a.to.node, a.to.port
      when 'removeInitial' then @graph.addInitial a.from.data, a.to.node, a.to.port
      when 'startTransaction' then null
      when 'endTransaction' then null
      when 'changeProperties' then @graph.setProperties a.old
      when 'addGroup' then @graph.removeGroup a.name
      when 'renameGroup' then @graph.renameGroup a.newName, a.oldName
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
      for r in [@currentRevision+1..revId]
        @executeEntry entry for entry in @store.fetchTransaction r

    else
      # Move backwards, and apply inverse changes
      for r in [@currentRevision..revId+1] by -1
        entries = @store.fetchTransaction r
        for i in [entries.length-1..0] by -1
          @executeEntryInversed entries[i]

    @currentRevision = revId
    @subscribed = true

  # ## Undoing & redoing
  # Undo the last graph change
  undo: () ->
    return unless @canUndo()
    @moveToRevision(@currentRevision-1)

  # If there is something to undo
  canUndo: () ->
    return @currentRevision > 0

  # Redo the last undo
  redo: () ->
    return unless @canRedo()
    @moveToRevision(@currentRevision+1)

  # If there is something to redo
  canRedo: () ->
    return @currentRevision < @store.lastRevision

  ## Serializing
  # Render a pretty printed string of the journal. Changes are abbreviated
  toPrettyString: (startRev, endRev) ->
    startRev |= 0
    endRev |= @store.lastRevision
    lines = []
    for r in [startRev...endRev]
      e = @store.fetchTransaction r
      lines.push (entryToPrettyString entry) for entry in e
    return lines.join('\n')

  # Serialize journal to JSON
  toJSON: (startRev, endRev) ->
    startRev |= 0
    endRev |= @store.lastRevision
    entries = []
    for r in [startRev...endRev] by 1
      entries.push (entryToPrettyString entry) for entry in @store.fetchTransaction r
    return entries

  save: (file, success) ->
    json = JSON.stringify @toJSON(), null, 4
    require('fs').writeFile "#{file}.json", json, "utf-8", (err, data) ->
      throw err if err
      success file

exports.Journal = Journal
exports.JournalStore = JournalStore
exports.MemoryJournalStore = MemoryJournalStore
