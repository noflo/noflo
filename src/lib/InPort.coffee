#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 TheGrid (Rituwall Inc.)
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

    if options and options.buffered is undefined
      options.buffered = false

    if not process and options and options.process
      process = options.process
      delete options.process

    if process
      unless typeof process is 'function'
        throw new Error 'process must be a function'
      @process = process

    if options?.handle
      unless typeof options.handle is 'function'
        throw new Error 'handle must be a function'
      @handle = options.handle

    super options

    do @prepareBuffer

  attachSocket: (socket, localId = null) ->

    # Assign a delegate for retrieving data should this inPort
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

  handleSocketEvent: (event, payload, id) ->
    # Handle buffering
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

    # Handle IP object
    if @handle
      if event is 'data' and typeof payload is 'object' and
      IP.types.indexOf(payload.type) isnt -1
        ip = payload
      else
        # Wrap legacy event
        switch event
          when 'connect', 'begingroup'
            ip = new IP 'openBracket'
            ip.groups = [ payload ] if payload
          when 'disconnect', 'endgroup'
            ip = new IP 'closeBracket'
          else
            ip = new IP 'data', payload

      ip.owner = @nodeInstance
      if @isAddressable()
        @handle ip, id, @nodeInstance
      else
        @handle ip, @nodeInstance

    # Call the processing function
    @braceCount = [] unless @braceCount
    @braceCount[id] = 0 unless @braceCount[id]
    @isUnwrapped = false
    if @process
      if event is 'data' and typeof payload is 'object' and
      IP.types.indexOf(payload.type) isnt -1
        # Translate IP object to legacy event
        switch payload.type
          when 'openBracket'
            event = if @braceCount[id] is 0 then 'connect' else 'begingroup'
            payload = payload.data
            @braceCount[id]++
          when 'closeBracket'
            @braceCount[id]--
            event = if @braceCount[id] is 0 then 'disconnect' else 'endgroup'
            payload = null
          else
            event = 'data'
            payload = payload.data
            @isUnwrapped = true if @braceCount[id] is 0
      if @isAddressable()
        @process 'connect', null, id, @nodeInstance if @isUnwrapped
        @process event, payload, id, @nodeInstance
        @process 'disconnect', null, id, @nodeInstance if @isUnwrapped
      else
        @process 'connect', null, @nodeInstance if @isUnwrapped
        @process event, payload, @nodeInstance
        @process 'disconnect', null, @nodeInstance if @isUnwrapped

    # Emit port event
    return @emit event, payload, id if @isAddressable()
    @emit event, payload

  hasDefault: ->
    return @options.default isnt undefined

  prepareBuffer: ->
    return unless @isBuffered()
    @buffer = []

  validateData: (data) ->
    return unless @options.values
    if @options.values.indexOf(data) is -1
      throw new Error "Invalid data='#{data}' received, not in [#{@options.values}]"

  # Returns the next packet in the buffer
  receive: ->
    unless @isBuffered()
      throw new Error 'Receive is only possible on buffered ports'
    @buffer.shift()

  # Returns the number of data packets in a buffered inport
  contains: ->
    unless @isBuffered()
      throw new Error 'Contains query is only possible on buffered ports'
    @buffer.filter((packet) -> return true if packet.event is 'data').length

module.exports = InPort
