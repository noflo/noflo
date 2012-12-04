noflo = require "../../lib/NoFlo"

class LastPacket extends noflo.Component
  constructor: ->
    @packets = null
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.in.on 'connect', =>
      @packets = []
    @inPorts.in.on 'data', (data) =>
      @packets.push data
    @inPorts.in.on 'disconnect', =>
      return if @packets.length is 0
      @outPorts.out.send @packets.pop()
      @outPorts.out.disconnect()
      @packets = null

exports.getComponent = -> new LastPacket
