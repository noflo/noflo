
# TODO: move this file into NoFlo itself, so it can be reused in all runtimes

if process?.env.DEBUG
  debug = console.log
else
  debug = () ->
    # ignore

class TraceBuffer
  constructor: () ->
    @events = [] # PERF: use a linked-list variety instead

  add: (event) ->
    # FIXME: respect a (configurable) limit on size. Time/ramusage est
    @events.push event

  getAll: (consumeFunc, doneFunc) ->
    for e in @events
      consumeFunc e
    return doneFunc null

# Convert to flowtrace/FBP-protocol format http://noflojs.org/documentation/protocol/
networkToTraceEvent = (networkId, type, data) ->

  debug 'event', networkId, type, data.id
  socket = data.socket

  # XXX: wasteful to have the network thing in each event?
  event =
    protocol: 'network'
    command: type
    payload:
      time: new Date().toISOString()
      graph: networkId
      src:
        node: socket.from?.process.id
        port: socket.from?.port
      tgt:
        node: socket.to?.process.id
        port: socket.to?.port
      id: undefined # deprecated
      subgraph: undefined # TODO: implement

  p = event.payload
  switch type
    when 'connect' then null
    when 'disconnect' then null
    when 'begingroup' then p.group = data.group
    when 'endgroup' then p.group = data.group
    when 'data' then p.data = data.data
    else
      throw new Error "trace: Unknown event type #{type}"

  return event

# Can be attached() to a NoFlo network, and keeps a circular buffer of events
# which can be persisted on request
class Tracer
  constructor: (@options) ->
    @buffer = new TraceBuffer
    @header =
      graphs: {}

  attach: (network) ->
    # FIXME: graphs loaded from .fbp don't have name. Should default to basename of file, and be configurable
    netId = network.graph.name or network.graph.properties.name or 'default'
    debug 'attach', netId
    eventNames = [
      'connect'
      'beginGroup'
      'data'
      'endGroup'
      'disconnect'
    ]
    eventNames.forEach (event) =>
      network.on event, (data) =>
        payload = networkToTraceEvent netId, event, data
        @buffer.add payload
    @header.graphs[netId] = network.graph.toJSON()

  detach: (network) ->
    # TODO: implement
    return

  # Serialize current content of buffer
  dumpString: (callback) ->
    events = []
    consume = (e) ->
      events.push e
    @buffer.getAll consume, (err) =>
      trace =
        header: @header
        events: events
      return callback err, JSON.stringify trace, null, 2

  # node.js only
  dumpFile: (filepath, callback) ->
    fs = require 'fs'
    temp = require 'temp'

    openFile = (cb) ->
      fs.open filepath, 'w', (err, fd) ->
        cb err, { path: filepath, fd: fd }
    if not filepath
      openFile = (cb) ->
        temp.open { suffix: '.json' }, cb

    openFile (err, info) =>
      return callback err if err
      @dumpString (err, data) ->
        fs.write info.fd, data, { encoding: 'utf-8' }, (err) ->
          return callback err, info.path


module.exports.Tracer = Tracer
