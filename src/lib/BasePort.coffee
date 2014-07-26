#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
#
# Base port type used for options normalization
{EventEmitter} = require 'events'

validTypes = [
  'all'
  'string'
  'number'
  'int'
  'object'
  'array'
  'boolean'
  'color'
  'date'
  'bang'
  'function'
  'buffer'
]

class BasePort extends EventEmitter
  constructor: (options) ->
    @handleOptions options
    @sockets = []
    @node = null
    @name = null

  handleOptions: (options) ->
    options = {} unless options
    options.datatype = 'all' unless options.datatype
    options.required = false if options.required is undefined

    options.datatype = 'int' if options.datatype is 'integer'
    if validTypes.indexOf(options.datatype) is -1
      throw new Error "Invalid port datatype '#{options.datatype}' specified, valid are #{validTypes.join(', ')}"

    if options.type and options.type.indexOf('/') is -1
      throw new Error "Invalid port type '#{options.type}' specified. Should be URL or MIME type"

    @options = options

  getId: ->
    unless @node and @name
      return 'Port'
    "#{@node} #{@name.toUpperCase()}"

  getDataType: -> @options.datatype
  getDescription: -> @options.description

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
    @sockets[index] = undefined
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

  listAttached: ->
    attached = []
    for socket, idx in @sockets
      continue unless socket
      attached.push idx
    attached

  isConnected: (socketId = null) ->
    if @isAddressable()
      throw new Error "#{@getId()}: Socket ID required" if socketId is null
      throw new Error "#{@getId()}: Socket #{socketId} not available" unless @sockets[socketId]
      return @sockets[socketId].isConnected()

    connected = false
    @sockets.forEach (socket) =>
      return unless socket
      if socket.isConnected()
        connected = true
    return connected

  canAttach: -> true

module.exports = BasePort
