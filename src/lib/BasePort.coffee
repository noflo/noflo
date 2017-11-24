#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license
{EventEmitter} = require 'events'

# ## NoFlo Port Base class
#
# Base port type used for options normalization. Both inports and outports extend this class.

# The list of valid datatypes for ports.
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
  'stream'
]

class BasePort extends EventEmitter
  constructor: (options) ->
    super()
    # Options holds all options of the current port
    @options = @handleOptions options
    # Sockets list contains all currently attached
    # connections to the port
    @sockets = []
    # Name of the graph node this port is in
    @node = null
    # Name of the port
    @name = null

  handleOptions: (options) ->
    options = {} unless options
    # We default to the `all` type if no explicit datatype
    # was provided
    options.datatype = 'all' unless options.datatype
    # By default ports are not required for graph execution
    options.required = false if options.required is undefined

    # Normalize the legacy `integer` type to `int`.
    options.datatype = 'int' if options.datatype is 'integer'

    # Ensure datatype defined for the port is valid
    if validTypes.indexOf(options.datatype) is -1
      throw new Error "Invalid port datatype '#{options.datatype}' specified, valid are #{validTypes.join(', ')}"

    # Ensure schema defined for the port is valid
    if options.type and not options.schema
      options.schema = options.type
      delete options.type
    if options.schema and options.schema.indexOf('/') is -1
      throw new Error "Invalid port schema '#{options.schema}' specified. Should be URL or MIME type"

    options

  getId: ->
    unless @node and @name
      return 'Port'
    "#{@node} #{@name.toUpperCase()}"

  getDataType: -> @options.datatype
  getSchema: -> @options.schema or null
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
    @sockets.forEach (socket) ->
      return unless socket
      if socket.isConnected()
        connected = true
    return connected

  canAttach: -> true

module.exports = BasePort
