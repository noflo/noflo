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

    if process
      unless typeof process is 'function'
        throw new Error 'process must be a function'
      @process = process

    super options

    do @sendDefault

  attachSocket: (socket, localId = null) ->
    socket.on 'connect', =>
      @handleSocketEvent 'connect', socket, localId
    socket.on 'begingroup', (group) =>
      @handleSocketEvent 'begingroup', group, localId
    socket.on 'data', (data) =>
      @handleSocketEvent 'data', data, localId
    socket.on 'endgroup', (group) =>
      @handleSocketEvent 'endgroup', group, localId
    socket.on 'disconnect', =>
      @handleSocketEvent 'disconnect', socket, localId

  handleSocketEvent: (event, payload, id) ->
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
      @emit 'data', @options.default
    , 0

module.exports = InPort
