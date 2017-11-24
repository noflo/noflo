#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license
BasePort = require './BasePort'
IP = require './IP'

# ## NoFlo outport
#
# Outport Port (outport) implementation for NoFlo components.
# These ports are the way a component sends Information Packets.
class OutPort extends BasePort
  constructor: (options = {}) ->
    options.scoped ?= true
    super options
    @cache = {}

  attach: (socket, index = null) ->
    super socket, index
    if @isCaching() and @cache[index]?
      @send @cache[index], index

  connect: (socketId = null) ->
    sockets = @getSockets socketId
    @checkRequired sockets
    for socket in sockets
      continue unless socket
      socket.connect()

  beginGroup: (group, socketId = null) ->
    sockets = @getSockets socketId
    @checkRequired sockets
    sockets.forEach (socket) ->
      return unless socket
      return socket.beginGroup group

  send: (data, socketId = null) ->
    sockets = @getSockets socketId
    @checkRequired sockets
    if @isCaching() and data isnt @cache[socketId]
      @cache[socketId] = data
    sockets.forEach (socket) ->
      return unless socket
      return socket.send data

  endGroup: (socketId = null) ->
    sockets = @getSockets socketId
    @checkRequired sockets
    for socket in sockets
      continue unless socket
      socket.endGroup()

  disconnect: (socketId = null) ->
    sockets = @getSockets socketId
    @checkRequired sockets
    for socket in sockets
      continue unless socket
      socket.disconnect()

  sendIP: (type, data, options, socketId, autoConnect = true) ->
    if IP.isIP type
      ip = type
      socketId = ip.index
    else
      ip = new IP type, data, options
    sockets = @getSockets socketId
    @checkRequired sockets

    if ip.datatype is 'all'
      # Stamp non-specific IP objects with port datatype
      ip.datatype = @getDataType()
    if @getSchema() and not ip.schema
      # Stamp non-specific IP objects with port schema
      ip.schema = @getSchema()

    if @isCaching() and data isnt @cache[socketId]?.data
      @cache[socketId] = ip
    pristine = true
    for socket in sockets
      continue unless socket
      if pristine
        socket.post ip, autoConnect
        pristine = false
      else
        ip = ip.clone() if ip.clonable
        socket.post ip, autoConnect
    @

  openBracket: (data = null, options = {}, socketId = null) ->
    @sendIP 'openBracket', data, options, socketId

  data: (data, options = {}, socketId = null) ->
    @sendIP 'data', data, options, socketId

  closeBracket: (data = null, options = {}, socketId = null) ->
    @sendIP 'closeBracket', data, options, socketId

  checkRequired: (sockets) ->
    if sockets.length is 0 and @isRequired()
      throw new Error "#{@getId()}: No connections available"

  getSockets: (socketId) ->
    # Addressable sockets affect only one connection at time
    if @isAddressable()
      throw new Error "#{@getId()} Socket ID required" if socketId is null
      return [] unless @sockets[socketId]
      return [@sockets[socketId]]
    # Regular sockets affect all outbound connections
    @sockets

  isCaching: ->
    return true if @options.caching
    false

module.exports = OutPort
