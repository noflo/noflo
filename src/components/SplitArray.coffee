noflo = require "noflo"

class SplitArray extends noflo.Component
    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @outPorts.out.send item for item in data
        @inPorts.in.on "disconnect", (data) =>
            @outPorts.out.disconnect()

exports.getComponent = -> new SplitArray
