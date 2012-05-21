noflo = require 'noflo'

class Concat extends noflo.Component
  constructor: ->
    @buffers = {}

    @inPorts =
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'connect', =>
      # In this component we need to know which of the sockets
      # sent the data, so we connect to the sockets directly
      @subscribeSocket id for socket, id in @inPorts.in.sockets
    @inPorts.in.on 'disconnect', =>
      @buffers = {}
      @outPorts.out.disconnect()

  subscribeSocket: (id) ->
    @buffers[id] = []
    @inPorts.in.sockets[id].on 'data', (data) =>
      @buffers[id].push data
      do @checkSend

  checkSend: ->
    # First check that we have data in all buffers
    for id, buffer of @buffers
      # If any of the buffers is empty we cancel
      return unless buffer.length

    # Okay, all buffers have data: send.
    @outPorts.out.send buffer.pop() for id, buffer of @buffers

exports.getComponent = -> new Concat
