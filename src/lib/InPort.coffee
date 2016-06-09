#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2016 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
#
# Input Port (inport) implementation for NoFlo components
BasePort = require './BasePort'
IP = require './IP'

class InPort extends BasePort
  constructor: (options, process) ->
    @process = null

    if not process and typeof options is 'function'
      process = options
      options = {}

    options ?= {}

    options.buffered ?= false
    options.control ?= false
    options.triggering ?= true

    if not process and options and options.process
      process = options.process
      delete options.process

    if process
      unless typeof process is 'function'
        throw new Error 'process must be a function'
      @process = process

    if options.handle
      unless typeof options.handle is 'function'
        throw new Error 'handle must be a function'
      @handle = options.handle
      delete options.handle

    super options

    @prepareBuffer()

  # Assign a delegate for retrieving data should this inPort
  attachSocket: (socket, localId = null) ->
    # have a default value.
    if @hasDefault()
      if @handle
        socket.setDataDelegate => new IP 'data', @options.default
      else
        socket.setDataDelegate => @options.default

    socket.on 'connect', =>
      @handleSocketEvent 'connect', socket, localId
    socket.on 'begingroup', (group) =>
      @handleSocketEvent 'begingroup', group, localId
    socket.on 'data', (data) =>
      @validateData data
      @handleSocketEvent 'data', data, localId
    socket.on 'endgroup', (group) =>
      @handleSocketEvent 'endgroup', group, localId
    socket.on 'disconnect', =>
      @handleSocketEvent 'disconnect', socket, localId
    socket.on 'ip', (ip) =>
      @handleIP ip, localId

  handleIP: (ip, id) ->
    return if @process
    return if @options.control and ip.type isnt 'data'
    ip.owner = @nodeInstance
    ip.index = id

    if ip.scope
      @scopedBuffer[ip.scope] = [] unless ip.scope of @scopedBuffer
      buf = @scopedBuffer[ip.scope]
    else
      buf = @buffer
    buf.push ip
    buf.shift() if @options.control and buf.length > 1

    if @handle
      @handle ip, @nodeInstance

    @emit 'ip', ip, id

  handleSocketEvent: (event, payload, id) ->
    # Handle buffering the old way
    if @isBuffered()
      @buffer.push
        event: event
        payload: payload
        id: id

      # Notify receiver
      if @isAddressable()
        @process event, id, @nodeInstance if @process
        @emit event, id
      else
        @process event, @nodeInstance if @process
        @emit event
      return

    if @process
      if @isAddressable()
        @process event, payload, id, @nodeInstance
      else
        @process event, payload, @nodeInstance

    # Emit port event
    return @emit event, payload, id if @isAddressable()
    @emit event, payload

  hasDefault: ->
    return @options.default isnt undefined

  prepareBuffer: ->
    @buffer = []
    @scopedBuffer = {}

  validateData: (data) ->
    return unless @options.values
    if @options.values.indexOf(data) is -1
      throw new Error "Invalid data='#{data}' received, not in [#{@options.values}]"

  # Returns the next packet in the (legacy) buffer
  receive: ->
    unless @isBuffered()
      throw new Error 'Receive is only possible on buffered ports'
    @buffer.shift()

  # Returns the number of data packets in a (legacy) buffered inport
  contains: ->
    unless @isBuffered()
      throw new Error 'Contains query is only possible on buffered ports'
    @buffer.filter((packet) -> return true if packet.event is 'data').length

  # Fetches a packet from the port
  get: (scope) ->
    if scope
      return undefined unless scope of @scopedBuffer
      buf = @scopedBuffer[scope]
    else
      buf = @buffer
    return if @options.control then buf[buf.length - 1] else buf.shift()

  # Returns true if port contains packet(s) matching the validator
  has: (scope, validate) ->
    if scope
      return false unless scope of @scopedBuffer
      buf = @scopedBuffer[scope]
    else
      return false unless @buffer.length
      buf = @buffer
    return true if validate packet for packet in buf
    false

  # Returns the number of data packets in an inport
  length: (scope) ->
    if scope
      return 0 unless scope of @scopedBuffer
      return @scopedBuffer[scope].length
    return @buffer.length

  # Tells if buffer has packets or not
  ready: (scope) ->
    return @length(scope) > 0

module.exports = InPort
