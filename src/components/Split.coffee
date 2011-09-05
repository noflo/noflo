noflo = require "noflo"

class Split extends noflo.Component
    description: "This component receives data on a single input port and sends the same data out to all connected output ports"

    constructor: ->
        @id = null

        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.ArrayPort()

        @inPorts.in.on "connect", (socket) =>
            @id = socket.id
        @inPorts.in.on "data", (data) =>
            @outPorts.out.send data, @id
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

exports.getComponent = ->
    new Split
