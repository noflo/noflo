port = require "./Port"
_ = require("underscore")

class ArrayPort extends port.Port
  constructor: (name) ->
    @sockets = []
    # Stack of grouping (i.e. where we currently are in the grouping hierarchy as IPs come in)
    @stacks = {}
    # The buffer of IPs
    @bufferedData = {}
    # A flag to prevent socket's emits duplicating existing buffers. Feels like a hack and it is because socket uses `emit`/`on` for both sending and receiving IPs (i.e. a duplex), so until someone discovers a smarter way, this is to stop listening while speaking.
    @isSending = false

  attach: (socket) ->
    @sockets.push socket
    @attachSocket socket

  attachSocket: (socket) ->
    @emit "attach", socket

    @from = socket.from
    socket.setMaxListeners 0
    socket.on "connect", (id) =>
      @emit "connect", socket, id
    socket.on "begingroup", (group, id) =>
      @buffer("begingroup", group, @bufferedData[id], @stacks[id])
      @emit "begingroup", group, id
    socket.on "data", (data, id) =>
      @buffer("data", data, @bufferedData[id], @stacks[id])
      @emit "data", data, id
    socket.on "endgroup", (group, id) =>
      @buffer("endgroup", group, @bufferedData[id], @stacks[id])
      @emit "endgroup", group, id
    socket.on "disconnect", (id) =>
      @emit "disconnect", socket, id
      @clearBuffer(id)

  buffer: (type, value, buffer, stack) ->
    return if @isSending
    buffer ?= @bufferedData["__ALL__"] ?= {}
    stack ?= @stacks["__ALL__"] ?= []

    super(type, value, buffer, stack)

  # Flush the buffered IPs
  flush: (id) ->
    socket = @sockets[id]

    # Helper function to connect and flush
    flushBuffer = (socket, id) =>
      id ?= "__ALL__"
      buffer = @bufferedData[id]

      unless _.isEmpty(buffer)
        socket.once "connect", =>
          # Flush the buffer to output
          @isSending = true
          @flushBuffer(buffer, socket, id)
          socket.disconnect(id)
          @isSending = false

        socket.connect(id)

    # Socket-specific
    if socket?
      flushBuffer(socket, id)

    # Buffer to be sent to all sockets
    for socket, id in @sockets
      buffer = @getBuffer()
      flushBuffer(socket)
      @setBuffer(buffer)
    # Clear buffer only after all sockets have been sent the buffer
    @clearBuffer()

  # Recursive helper
  flushBuffer: (buffer, socket, id) ->
    for name, value of buffer
      # Data
      if name is "__DATA__"
        for data in value
          socket.send(data, id)
      # Groups
      else
        socket.beginGroup(name, id)
        @flushBuffer(value, socket, id)
        socket.endGroup(name, id)

  clearBuffer: (id) ->
    id ?= "__ALL__"
    @stacks[id] = []
    @bufferedData[id] = {}

  setup: (id) ->
    throw new Error "No connection available" unless @isAttached(id)
    # Designate flow to a certain id or to all
    id ?= "__ALL__"
    @stacks[id] ?= []
    @bufferedData[id] ?= {}
    id

  connect: () ->
    @setup()

  beginGroup: (group, id) ->
    id = @setup(id)
    @buffer("begingroup", group, @bufferedData[id], @stacks[id])

  send: (data, id) ->
    id = @setup(id)
    @buffer("data", data, @bufferedData[id], @stacks[id])

  endGroup: (id) ->
    id = @setup(id)
    @buffer("endgroup", null, @bufferedData[id], @stacks[id])

  disconnect: (id) ->
    return unless @isAttached(id)
    @flush(id)

  detach: (socket) ->
    if @sockets.indexOf(socket) is -1
      return

    @emit "detach", @socket

    @sockets.splice @sockets.indexOf(socket), 1

  isConnected: (socketId = null) ->
    if socketId is null
      connected = true
      @sockets.forEach (socket) =>
        unless socket.isConnected()
          connected = false
      return connected

    unless @sockets[socketId]
      return false
    @sockets[socketId].isConnected()

  isAttached: (id) ->
    if id?
      @sockets[id]?
    else
      @sockets.length > 0

  # Naive implementation of deep-copy. Only used to copy buffer when it is requested for external use. Use a library instead?
  deepCopy: (obj) ->
    copied = {}

    for key, value of obj
      if Object::toString.call(value) is "[object Object]"
        copied[key] = @deepCopy(value)
      else if Object::toString.call(value) is "[object Array]"
        copied[key] = []
        for item in value
          copied[key].push(item)
      else
        copied[key] = value

    copied

  getData: (id) ->
    id ?= "__ALL__"
    super(@bufferedData[id], @stacks[id])
  setData: (data, id) ->
    id ?= "__ALL__"
    super(data, @bufferedData[id], @stacks[id])

  getGroups: (id) ->
    id ?= "__ALL__"
    @stacks[id] or []
  setGroups: (groups, id) ->
    id ?= "__ALL__"
    @stacks[id] = groups

  getBuffer: (id) ->
    id ?= "__ALL__"
    @deepCopy(@bufferedData[id])
  setBuffer: (buffer, id) ->
    id ?= "__ALL__"
    @bufferedData[id] = buffer

  getBufferData: (id) ->
    id ?= "__ALL__"
    super(@bufferedData[id])

exports.ArrayPort = ArrayPort
