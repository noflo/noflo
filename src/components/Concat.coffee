noflo = require '../../lib/NoFlo'

class Concat extends noflo.Component
  constructor: ->
    @buffers = {}
    @hasConnected = {}

    @inPorts =
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port

    subscribed = false
    @inPorts.in.on 'connect', (socket) =>
      @hasConnected[@inPorts.in.sockets.indexOf(socket)] = true

      # In this component we need to know which of the sockets
      # sent the data, so we connect to the sockets directly
      unless subscribed
        @subscribeSocket id for socket, id in @inPorts.in.sockets
        subscribed = true

    @inPorts.in.on 'begingroup', (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on 'endgroup', =>
      @outPorts.out.endGroup()
    @inPorts.in.on 'disconnect', =>
      # Check that all ports have disconnected before emitting
      for socket in @inPorts.in.sockets
        return if socket.isConnected()
      do @clearBuffers
      @outPorts.out.disconnect()

  clearBuffers: ->
    for id, data of @buffers
      return unless @hasConnected[id]
    @buffers = {}
    @hasConnected = {}

  subscribeSocket: (id) ->
    @buffers[id] = []
    @inPorts.in.sockets[id].on 'data', (data) =>
      unless typeof @buffers[id] is 'object'
        @buffers[id] = []
      @buffers[id].push data
      do @checkSend

  checkSend: ->
    # First check that we have data in all buffers
    for socket, id in @inPorts.in.sockets
      # If any of the buffers is empty we cancel
      return unless @buffers[id]
      return unless @buffers[id].length

    # Okay, all buffers have data: send.
    @outPorts.out.send buffer.shift() for id, buffer of @buffers

exports.getComponent = -> new Concat
