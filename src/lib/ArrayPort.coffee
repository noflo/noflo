#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2014 TheGrid (Rituwall Inc.)
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# ArrayPorts are similar to regular ports except that they're able to handle multiple
# connections and even address them separately.
port = require "./Port"

class ArrayPort extends port.Port
  constructor: (@type) ->
    super @type

  attach: (socket, socketId = null) ->
    socketId = @sockets.length if socketId is null
    @sockets[socketId] = socket
    @attachSocket socket, socketId

  connect: (socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "#{@getId()}: No connections available"
      @sockets.forEach (socket) ->
        return unless socket
        socket.connect()
      return

    unless @sockets[socketId]
      throw new Error "#{@getId()}: No connection '#{socketId}' available"

    @sockets[socketId].connect()

  beginGroup: (group, socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "#{@getId()}: No connections available"
      @sockets.forEach (socket, index) =>
        return unless socket
        @beginGroup group, index
      return

    unless @sockets[socketId]
      throw new Error "#{@getId()}: No connection '#{socketId}' available"

    return @sockets[socketId].beginGroup group if @isConnected socketId

    @sockets[socketId].once "connect", =>
      @sockets[socketId].beginGroup group
    @sockets[socketId].connect()

  send: (data, socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "#{@getId()}: No connections available"
      @sockets.forEach (socket, index) =>
        return unless socket
        @send data, index
      return

    unless @sockets[socketId]
      throw new Error "#{@getId()}: No connection '#{socketId}' available"

    return @sockets[socketId].send data if @isConnected socketId

    @sockets[socketId].once "connect", =>
      @sockets[socketId].send data
    @sockets[socketId].connect()

  endGroup: (socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "#{@getId()}: No connections available"
      @sockets.forEach (socket, index) =>
        return unless socket
        @endGroup index
      return

    unless @sockets[socketId]
      throw new Error "#{@getId()}: No connection '#{socketId}' available"

    do @sockets[socketId].endGroup

  disconnect: (socketId = null) ->
    if socketId is null
      unless @sockets.length
        throw new Error "#{@getId()}: No connections available"
      for socket in @sockets
        return unless socket
        socket.disconnect()
      return

    return unless @sockets[socketId]
    @sockets[socketId].disconnect()

  isConnected: (socketId = null) ->
    if socketId is null
      connected = false
      @sockets.forEach (socket) =>
        return unless socket
        if socket.isConnected()
          connected = true
      return connected

    unless @sockets[socketId]
      return false
    @sockets[socketId].isConnected()

  isAddressable: -> true

  isAttached: (socketId) ->
    if socketId is undefined
      for socket in @sockets
        return true if socket
      return false
    return true if @sockets[socketId]
    false

exports.ArrayPort = ArrayPort
