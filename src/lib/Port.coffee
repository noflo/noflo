#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2011 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
if typeof process is 'object' and process.title is 'node'
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class Port extends EventEmitter
  constructor: (@type) ->
    @type = 'all' unless @type
    @socket = null
    @from = null

  attach: (socket) ->
    throw new Error "#{@name}: Socket already attached #{@socket.getId()} - #{socket.getId()}" if @isAttached()
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
    throw new Error "No connection available" unless @socket
    do @socket.connect

  beginGroup: (group) ->
    throw new Error "No connection available" unless @socket

    return @socket.beginGroup group if @isConnected()

    @socket.once "connect", =>
      @socket.beginGroup group
    do @socket.connect

  send: (data) ->
    throw new Error "No connection available" unless @socket

    return @socket.send data if @isConnected()

    @socket.once "connect", =>
      @socket.send data
    do @socket.connect

  endGroup: ->
    throw new Error "No connection available" unless @socket
    do @socket.endGroup

  disconnect: ->
    throw new Error "No connection available" unless @socket
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

exports.Port = Port
