#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 The Grid
#     NoFlo may be freely distributed under the MIT license
#
# Base port type used for options normalization
unless require('./Platform').isBrowser()
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class BasePort extends EventEmitter
  constructor: (@options) ->
    @options = {} unless @options
    @options.datatype = 'all' unless @options.datatype
    @options.required = true if @options.required is undefined
    @sockets = []
    @node = null
    @name = null

  getId: ->
    unless @node and @name
      return 'Port'
    "#{@node} #{@name.toUpperCase()}"

  getDataType: -> @options.datatype

  attach: (socket, index = null) ->
    if not @isAddressable() or index is null
      index = @sockets.length
    @sockets[index] = socket
    @attachSocket socket, index
    if @isAddressable()
      @emit 'attach', socket, index
      return
    @emit 'attach', socket

  attachSocket: ->

  detach: (socket) ->
    index = @sockets.indexOf socket
    if index is -1
      return
    @sockets.splice index, 1
    if @isAddressable()
      @emit 'detach', socket, index
      return
    @emit 'detach', socket

  isAddressable: ->
    return true if @options.addressable
    false

  isBuffered: ->
    return true if @options.buffered
    false

  isRequired: ->
    return true if @options.required
    false

  isAttached: (socketId = null) ->
    if @isAddressable() and socketId isnt null
      return true if @sockets[socketId]
      return false
    return true if @sockets.length
    false

  isConnected: (socketId = null) ->
    if @isAddressable()
      throw new Error "#{@getId()}: Socket ID required" if socketId is null
      throw new Error "#{@getId()}: Socket #{socketId} not available" unless @sockets[socketId]
      return @sockets[socketId].isConnected()

    connected = false
    @sockets.forEach (socket) =>
      if socket.isConnected()
        connected = true
    return connected

  canAttach: -> true

module.exports = BasePort
