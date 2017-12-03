#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014-2017 Flowhub UG
#     NoFlo may be freely distributed under the MIT license
BasePort = require './BasePort'
IP = require './IP'

# ## NoFlo inport
#
# Input Port (inport) implementation for NoFlo components. These
# ports are the way a component receives Information Packets.
class InPort extends BasePort
  constructor: (options = {}) ->
    options.control ?= false
    options.scoped ?= true
    options.triggering ?= true

    if options.process
      throw new Error 'InPort process callback is deprecated. Please use Process API'

    if options.handle
      throw new Error 'InPort handle callback is deprecated. Please use Process API'

    super options

    @prepareBuffer()

  # Assign a delegate for retrieving data should this inPort
  attachSocket: (socket, localId = null) ->
    # have a default value.
    if @hasDefault()
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
    return if @options.control and ip.type isnt 'data'
    ip.owner = @nodeInstance
    ip.index = id if @isAddressable()
    if ip.datatype is 'all'
      # Stamp non-specific IP objects with port datatype
      ip.datatype = @getDataType()
    if @getSchema() and not ip.schema
      # Stamp non-specific IP objects with port schema
      ip.schema = @getSchema()

    buf = @prepareBufferForIP ip
    buf.push ip
    buf.shift() if @options.control and buf.length > 1

    @emit 'ip', ip, id

  handleSocketEvent: (event, payload, id) ->
    # Emit port event
    return @emit event, payload, id if @isAddressable()
    @emit event, payload

  hasDefault: ->
    return @options.default isnt undefined

  prepareBuffer: ->
    if @isAddressable()
      @scopedBuffer = {} if @options.scoped
      @indexedBuffer = {}
      @iipBuffer = {}
      return
    @scopedBuffer = {} if @options.scoped
    @iipBuffer = []
    @buffer = []
    return

  prepareBufferForIP: (ip) ->
    if @isAddressable()
      if ip.scope? and @options.scoped
        @scopedBuffer[ip.scope] = [] unless ip.scope of @scopedBuffer
        @scopedBuffer[ip.scope][ip.index] = [] unless ip.index of @scopedBuffer[ip.scope]
        return @scopedBuffer[ip.scope][ip.index]
      if ip.initial
        @iipBuffer[ip.index] = [] unless ip.index of @iipBuffer
        return @iipBuffer[ip.index]
      @indexedBuffer[ip.index] = [] unless ip.index of @indexedBuffer
      return @indexedBuffer[ip.index]
    if ip.scope? and @options.scoped
      @scopedBuffer[ip.scope] = [] unless ip.scope of @scopedBuffer
      return @scopedBuffer[ip.scope]
    if ip.initial
      return @iipBuffer
    return @buffer

  validateData: (data) ->
    return unless @options.values
    if @options.values.indexOf(data) is -1
      throw new Error "Invalid data='#{data}' received, not in [#{@options.values}]"

  getBuffer: (scope, idx, initial = false) ->
    if @isAddressable()
      if scope? and @options.scoped
        return undefined unless scope of @scopedBuffer
        return undefined unless idx of @scopedBuffer[scope]
        return @scopedBuffer[scope][idx]
      if initial
        return undefined unless idx of @iipBuffer
        return @iipBuffer[idx]
      return undefined unless idx of @indexedBuffer
      return @indexedBuffer[idx]
    if scope? and @options.scoped
      return undefined unless scope of @scopedBuffer
      return @scopedBuffer[scope]
    if initial
      return @iipBuffer
    return @buffer

  getFromBuffer: (scope, idx, initial = false) ->
    buf = @getBuffer scope, idx, initial
    return undefined unless buf?.length
    return if @options.control then buf[buf.length - 1] else buf.shift()

  # Fetches a packet from the port
  get: (scope, idx) ->
    res = @getFromBuffer scope, idx
    return res if res isnt undefined
    # Try to find an IIP instead
    @getFromBuffer null, idx, true

  hasIPinBuffer: (scope, idx, validate, initial = false) ->
    buf = @getBuffer scope, idx, initial
    return false unless buf?.length
    for packet in buf
      return true if validate packet
    false

  hasIIP: (idx, validate) ->
    @hasIPinBuffer null, idx, validate, true

  # Returns true if port contains packet(s) matching the validator
  has: (scope, idx, validate) ->
    unless @isAddressable()
      validate = idx
      idx = null
    return true if @hasIPinBuffer scope, idx, validate
    return true if @hasIIP idx, validate
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
