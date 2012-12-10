events = require "events"

class Port extends events.EventEmitter
  constructor: (name) ->
    @name = name
    @socket = null
    @from = null
    # Stack of grouping (i.e. where we currently are in the grouping hierarchy as IPs come in)
    @stack = []
    # The buffer of IPs
    @bufferedData = {}
    # A flag to prevent socket's emits duplicating existing buffers. Feels like a hack and it is because socket uses `emit`/`on` for both sending and receiving IPs (i.e. a duplex), so until someone discovers a smarter way, this is to stop listening while speaking.
    @isSending = false

  attach: (socket) ->
    throw new Error "#{@name}: Socket already attached #{@socket.getId()} - #{socket.getId()}" if @socket
    @socket = socket

    @attachSocket socket

  attachSocket: (socket) ->
    @emit "attach", socket

    @from = socket.from
    socket.setMaxListeners 0
    socket.on "connect", =>
      @emit "connect", socket
    socket.on "begingroup", (group) =>
      @buffer("begingroup", group)
      @emit "begingroup", group
    socket.on "data", (data) =>
      @buffer("data", data)
      @emit "data", data
    socket.on "endgroup", (group) =>
      @buffer("endgroup", group)
      @emit "endgroup", group
    socket.on "disconnect", =>
      @emit "disconnect", socket
      @clearBuffer()

  # Buffer IPs and flush on disconnect
  buffer: (type, value, buffer, stack) ->
    return if @isSending
    buffer ?= @bufferedData
    stack ?= @stack

    # Get to where we are right now in buffer
    for step in stack
      buffer = buffer[step]

    switch type
      when "begingroup"
        buffer[value] ?= {}
        stack.push(value)
      when "data"
        buffer["__DATA__"] ?= []
        buffer["__DATA__"].push(value)
      when "endgroup"
        stack.pop()

  # Flush the buffered IPs
  flush: () ->
    @socket.once "connect", =>
      @isSending = true
      @flushBuffer(@bufferedData, @socket)
      @socket.disconnect()
      @isSending = false

    @socket.connect()

  # Recursive helper
  flushBuffer: (buffer, socket) ->
    for name, value of buffer
      # Data
      if name is "__DATA__"
        for data in value
          socket.send(data)
      # Groups
      else
        socket.beginGroup(name)
        @flushBuffer(value, socket)
        socket.endGroup(name)

  # Each connection should clear buffer before use
  clearBuffer: () ->
    @stack = []
    @bufferedData = {}

  connect: ->
    throw new Error "No connection available" unless @isAttached()
    @clearBuffer()

  beginGroup: (group) ->
    throw new Error "No connection available" unless @isAttached()
    @buffer("begingroup", group)

  send: (data) ->
    throw new Error "No connection available" unless @isAttached()
    @buffer("data", data)

  endGroup: ->
    throw new Error "No connection available" unless @isAttached()
    @buffer("endgroup")

  disconnect: ->
    return unless @isAttached()
    @flush()

  detach: (socket) ->
    @emit "detach", @socket
    @from = null
    @socket = null

  isConnected: ->
    unless @socket
      return false
    @socket.isConnected()

  isAttached: ->
    @socket isnt null

  # Get to the data IPs given a "group path" in the buffered IPs' hierarchy. Using array methods on it will directly change the buffer.
  getData: (buffer, stack) ->
    buffer ?= @bufferedData
    stack ?= @stack

    for step in stack
      buffer = buffer[step]

    buffer["__DATA__"] ?= []

  setData: (data, buffer, stack) ->
    buffer ?= @bufferedData
    stack ?= @stack

    for step in stack
      buffer = buffer[step]

    buffer["__DATA__"] = data

  # Get the "path" of groups at this point in time. Say groups "A", "B", and "C" were begun but not ended, you'd get `["A", "B", "C"]`. Good for hierarchical grouping.
  getGroups: ->
    @stack
  setGroups: (@stack) ->

  # Get the entire `bufferedData` object
  getBuffer: ->
    @bufferedData
  setBuffer: (@bufferedData) ->

  # Get only the data IPs
  getBufferData: (buffer) ->
    buffer ?= @bufferedData

    traverse = (buffer) ->
      ret = []

      for key, value of buffer
        if key is "__DATA__"
          ret.push(value)
        else
          ret.push.apply(ret, traverse(value))

      ret
  
    traverse(buffer)

exports.Port = Port
