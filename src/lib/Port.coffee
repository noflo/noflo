#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013 The Grid
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Regular port for NoFlo components.
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class Port extends EventEmitter
  constructor: (@type) ->
    @type = 'all' unless @type
    @socket = null
    @from = null
    @node = null
    @name = null

  getId: ->
    unless @node and @name
      return 'Port'
    "#{@node} #{@name.toUpperCase()}"

  attach: (socket) ->
    throw new Error "#{@getId()}: Socket already attached #{@socket.getId()} - #{socket.getId()}" if @isAttached()
    @socket = socket

    @attachSocket socket

  attachSocket: (socket, localId = null) ->
    @emit "attach", socket

    @from = socket.from
    socket.setMaxListeners 0 if socket.setMaxListeners
    socket.on "connect", =>
      @emit "connect", socket, localId
    socket.on "begingroup", (group) =>
      @emit "begingroup", group, localId
    socket.on "data", (data) =>
      @emit "data", data, localId
    socket.on "endgroup", (group) =>
      @emit "endgroup", group, localId
    socket.on "disconnect", =>
      @emit "disconnect", socket, localId

  connect: ->
    throw new Error "#{@getId()}: No connection available" unless @socket
    do @socket.connect

  beginGroup: (group) ->
    throw new Error "#{@getId()}: No connection available" unless @socket

    return @socket.beginGroup group if @isConnected()

    @socket.once "connect", =>
      @socket.beginGroup group
    do @socket.connect

  send: (data) ->
    throw new Error "#{@getId()}: No connection available" unless @socket

    return @socket.send data if @isConnected()

    @socket.once "connect", =>
      @socket.send data
    do @socket.connect

  endGroup: ->
    throw new Error "#{@getId()}: No connection available" unless @socket
    do @socket.endGroup

  disconnect: ->
    throw new Error "#{@getId()}: No connection available" unless @socket
    @socket.disconnect()

  detach: (socket) ->
    return unless @isAttached socket
    @emit "detach", @socket
    @from = null
    @socket = null

  isConnected: ->
    unless @socket
      return false
    @socket.isConnected()

  isAttached: ->
    @socket isnt null

  canAttach: ->
    if @isAttached()
      return false
    true

exports.Port = Port
