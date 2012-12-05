events = require "events"

class Port extends events.EventEmitter
  constructor: (name) ->
    @name = name
    @socket = null
    @from = null
    @downstreamIsGettingReady = false
    @groups = []
    @data = []
    @buffer = []

    @on "ready", () =>
      if @downstreamIsGettingReady
        # Reset the flag
        @downstreamIsGettingReady = false

        # Each record in buffer is a separate connection
        for conn in @buffer
          for group in conn.groups
            @beginGroup(group)

          for datum in conn.data
            @send(datum)

          for group in conn.groups
            @endGroup()

          @disconnect()

        @buffer = []

  attach: (socket) ->
    throw new Error "#{@name}: Socket already attached #{@socket.getId()} - #{socket.getId()}" if @isAttached()
    @socket = socket

    @attachSocket socket

  attachSocket: (socket, localId = null) ->
    @emit "attach", socket

    @from = socket.from
    socket.setMaxListeners 0
    socket.on "connect", =>
      @emit "connect", socket, localId
    socket.on "begingroup", (group) =>
      @emit "begingroup", group, localId
    socket.on "data", (data) =>
      @emit "data", data, localId
    socket.on "endgroup", (group) =>
      @emit "endgroup", group, localId
    socket.on "disconnect", =>
      @emit "disconnect", socket, localId

  connect: ->
    if @downstreamIsGettingReady
      return

    throw new Error "No connection available" unless @socket
    do @socket.connect

  beginGroup: (group) ->
    if @downstreamIsGettingReady
      @groups.push(group)
      return

    throw new Error "No connection available" unless @socket

    return @socket.beginGroup group if @isConnected()

    @socket.once "connect", =>
      @socket.beginGroup group
    do @socket.connect

  send: (data) ->
    if @downstreamIsGettingReady
      @data.push(data)
      return

    throw new Error "No connection available" unless @socket

    return @socket.send data if @isConnected()

    @socket.once "connect", =>
      @socket.send data
    do @socket.connect

  endGroup: ->
    if @downstreamIsGettingReady
      return

    throw new Error "No connection available" unless @socket
    do @socket.endGroup

  disconnect: ->
    if @downstreamIsGettingReady
      buffer =
        groups: @groups
        data: @data
      @buffer.push(buffer)

      @groups = []
      @data = []

      return

    return unless @socket
    @socket.disconnect()

  detach: (socket) ->
    return unless @isAttached socket
    @emit "detach", @socket
    @from = null
    @socket = null

  isConnected: ->
    unless @socket
      return false
    @socket.isConnected()

  isAttached: ->
    @socket isnt null

exports.Port = Port
