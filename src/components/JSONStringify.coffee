noflo = require "noflo"

class JSONStringify extends noflo.Component

    description: "This component receives input on a single inport, serializes it and sends the data to the out port."

    constructor: ->
        @inPorts =
            in: new noflo.ArrayPort()

        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @outPorts.out.send JSON.stringify data

exports.getComponent = ->
    new JSONStringify()
