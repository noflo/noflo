noflo = require "../../lib/NoFlo"

class UniquePacket extends noflo.Component
  constructor: ->
    @seen = {}

    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      duplicate: new noflo.Port()

    @inPorts.in.on "data", (data) =>
      unless @unique data
        return unless @outPorts.duplicate.isAttached()
        @outPorts.duplicate.send data
        return
      @outPorts.out.send data
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

  unique: (packet) ->
    stringed = JSON.stringify packet
    return false if @seen[stringed]
    @seen[stringed] = true
    return true

exports.getComponent = -> new UniquePacket
