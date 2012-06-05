noflo = require 'noflo'

class Concat extends noflo.Component
  constructor: ->
    @buffers = {}
    subscribed = false

    @inPorts =
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'connect', =>
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
      @buffers = {}
      @outPorts.out.disconnect()

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
