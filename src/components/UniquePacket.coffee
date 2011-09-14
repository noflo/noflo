noflo = require "noflo"

class UniquePacket extends noflo.Component
    constructor: ->
        @seen = {}

        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @outPorts.out.send data if @unique data
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

    unique: (packet) ->
        stringed = JSON.stringify packet
        return false if @seen[stringed]
        @seen[stringed] = true
        return true

exports.getComponent = -> new UniquePacket
