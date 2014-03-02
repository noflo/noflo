#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 The Grid
#     NoFlo may be freely distributed under the MIT license
#
# Input Port (inport) implementation for NoFlo components
BasePort = require './BasePort'

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

    super options

    do @sendDefault
    do @prepareBuffer

  attachSocket: (socket, localId = null) ->
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

    # Call the processing function
    if @process
      if @isAddressable()
        @process event, payload, id, @nodeInstance
      else
        @process event, payload, @nodeInstance

    # Emit port event
    return @emit event, payload, id if @isAddressable()
    @emit event, payload

  sendDefault: ->
    return if @options.default is undefined
    setTimeout =>
      for socket, idx in @sockets
        @handleSocketEvent 'data', @options.default, idx
    , 0

  prepareBuffer: ->
    return unless @isBuffered()
    @buffer = []

  validateData: (data) ->
    return unless @options.values
    if @options.values.indexOf(data) is -1
      throw new Error 'Invalid data received'

  # Returns the next packet in the buffer
  receive: ->
    unless @isBuffered()
      throw new Error 'Receive is only possible on buffered ports'
    @buffer.shift()

module.exports = InPort
