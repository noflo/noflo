#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013 The Grid
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Regular port for NoFlo components.
unless require('./Platform').isBrowser()
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class Port extends EventEmitter
  description: ''
  required: true
  constructor: (@type) ->
    @type = 'all' unless @type
    @sockets = []
    @from = null
    @node = null
    @name = null

  getId: ->
    unless @node and @name
      return 'Port'
    "#{@node} #{@name.toUpperCase()}"

  getDataType: -> @type
  getDescription: -> @description

  attach: (socket) ->
    @sockets.push socket
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
    if @sockets.length is 0
      throw new Error "#{@getId()}: No connections available"
    socket.connect() for socket in @sockets

  beginGroup: (group) ->
    if @sockets.length is 0
      throw new Error "#{@getId()}: No connections available"

    @sockets.forEach (socket) ->
      return socket.beginGroup group if socket.isConnected()
      socket.once 'connect', ->
        socket.beginGroup group
      do socket.connect

  send: (data) ->
    if @sockets.length is 0
      throw new Error "#{@getId()}: No connections available"

    @sockets.forEach (socket) ->
      return socket.send data if socket.isConnected()
      socket.once 'connect', ->
        socket.send data
      do socket.connect

  endGroup: ->
    if @sockets.length is 0
      throw new Error "#{@getId()}: No connections available"
    socket.endGroup() for socket in @sockets

  disconnect: ->
    if @sockets.length is 0
      throw new Error "#{@getId()}: No connections available"
    socket.disconnect() for socket in @sockets

  detach: (socket) ->
    return if @sockets.length is 0
    socket = @sockets[0] unless socket
    index = @sockets.indexOf socket
    return if index is -1
    @sockets.splice index, 1
    @emit "detach", socket

  isConnected: ->
    connected = false
    @sockets.forEach (socket) =>
      if socket.isConnected()
        connected = true
    connected

  isAddressable: -> false
  isRequired: -> @required

  isAttached: ->
    return true if @sockets.length > 0
    false

  canAttach: -> true

exports.Port = Port
