#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2016 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
#
# Input Port (inport) implementation for NoFlo components
BasePort = require './BasePort'
IP = require './IP'
platform = require './Platform'

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
      platform.deprecated 'InPort process callback is deprecated. Please use Process API or the InPort handle option'
      unless typeof process is 'function'
        throw new Error 'process must be a function'
      @process = process

    if options.handle
      platform.deprecated 'InPort handle callback is deprecated. Please use Process API'
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
    ip.index = id if @isAddressable()

    buf = @prepareBufferForIP ip
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
    @indexedBuffer = {} if @isAddressable()
    @scopedBuffer = {}

  prepareBufferForIP: (ip) ->
    if @isAddressable()
      if ip.scope?
        @scopedBuffer[ip.scope] = [] unless ip.scope of @scopedBuffer
        @scopedBuffer[ip.scope][ip.index] = [] unless ip.index of @scopedBuffer[ip.scope]
        return @scopedBuffer[ip.scope][ip.index]
      @indexedBuffer[ip.index] = [] unless ip.index of @indexedBuffer
      return @indexedBuffer[ip.index]
    if ip.scope?
      @scopedBuffer[ip.scope] = [] unless ip.scope of @scopedBuffer
      return @scopedBuffer[ip.scope]
    return @buffer

  validateData: (data) ->
    return unless @options.values
    if @options.values.indexOf(data) is -1
      throw new Error "Invalid data='#{data}' received, not in [#{@options.values}]"

  # Returns the next packet in the (legacy) buffer
  receive: ->
    platform.deprecated 'InPort.receive is deprecated. Use InPort.get instead'
    unless @isBuffered()
      throw new Error 'Receive is only possible on buffered ports'
    @buffer.shift()

  # Returns the number of data packets in a (legacy) buffered inport
  contains: ->
    platform.deprecated 'InPort.contains is deprecated. Use InPort.has instead'
    unless @isBuffered()
      throw new Error 'Contains query is only possible on buffered ports'
    @buffer.filter((packet) -> return true if packet.event is 'data').length

  getBuffer: (scope, idx) ->
    if scope?
      return undefined unless scope of @scopedBuffer
      buf = @scopedBuffer[scope]
    else
      buf = @buffer
    return buf

  # Fetches a packet from the port
  get: (scope, idx) ->
    buf = @getBuffer scope, idx
    return if @options.control then buf[buf.length - 1] else buf.shift()

  # Returns true if port contains packet(s) matching the validator
  has: (scope, idx, validate) ->
    unless @isAddressable()
      validate = idx
      idx = null
    buf = @getBuffer scope, idx
    return false unless buf?.length
    for packet in buf
      return true if validate packet
    false

  # Returns the number of data packets in an inport
  length: (scope, idx) ->
    buf = @getBuffer scope, idx
    return 0 unless buf
    return buf.length

  # Tells if buffer has packets or not
  ready: (scope, idx) ->
    return @length(scope) > 0

  # Clears inport buffers
  clear: ->
    @prepareBuffer()

module.exports = InPort
