port = require "./Port"

class ArrayPort extends port.Port
  constructor: (@type) ->
    @type = 'all' unless @type
    @sockets = []

  attach: (socket) ->
    @sockets.push socket
    @attachSocket socket, @sockets.length - 1

  connect: (socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "No sockets available"
      @sockets.forEach (socket) ->
        socket.connect()
      return

    unless @sockets[socketId]
      throw new Error "No socket '#{socketId}' available"

    @sockets[socketId].connect()

  beginGroup: (group, socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "No sockets available"
      @sockets.forEach (socket, index) =>
        @beginGroup group, index
      return

    unless @sockets[socketId]
      throw new Error "No socket '#{socketId}' available"

    return @sockets[socketId].beginGroup group if @isConnected socketId

    @sockets[socketId].once "connect", =>
      @sockets[socketId].beginGroup group
    @sockets[socketId].connect()

  send: (data, socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "No sockets available"
      @sockets.forEach (socket, index) =>
        @send data, index
      return

    unless @sockets[socketId]
      throw new Error "No socket '#{socketId}' available"

    return @sockets[socketId].send data if @isConnected socketId

    @sockets[socketId].once "connect", =>
      @sockets[socketId].send data
    @sockets[socketId].connect()

  endGroup: (socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "No sockets available"
      @sockets.forEach (socket, index) =>
        @endGroup index
      return

    unless @sockets[socketId]
      throw new Error "No socket '#{socketId}' available"

    do @sockets[socketId].endGroup

  disconnect: (socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "No sockets available"
      for socket in @sockets
        socket.disconnect()
      return

    return unless @sockets[socketId]
    @sockets[socketId].disconnect()

  detach: (socket) ->
    if @sockets.indexOf(socket) is -1
      return
    @sockets.splice @sockets.indexOf(socket), 1
    @emit "detach", socket

  isConnected: (socketId = null) ->
    if socketId is null
      connected = false
      @sockets.forEach (socket) =>
        if socket.isConnected()
          connected = true
      return connected

    unless @sockets[socketId]
      return false
    @sockets[socketId].isConnected()

  isAttached: (socketId) ->
    return false if socketId is undefined
    return true if @sockets[socketId]
    false

exports.ArrayPort = ArrayPort
