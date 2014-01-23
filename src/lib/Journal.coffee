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
    else throw new Error("Unknown journal entry: #{entry.cmd}")


class Journal extends EventEmitter
  graph: null
  entries: []

  constructor: (graph) ->
    @graph = graph
    @entries = []

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
    entry =
      cmd: cmd
      args: args
    @entries.push(entry)

  toJSON: () ->
    return @entries

  toPrettyString: () ->
    lines = (entryToPrettyString entry for entry in @entries)
    return lines.join('\n')

  save: (file, success) ->
    json = JSON.stringify @toJSON(), null, 4
    require('fs').writeFile "#{file}.json", json, "utf-8", (err, data) ->
      throw err if err
      success file

exports.Journal = Journal
