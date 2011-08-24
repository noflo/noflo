noflo = require "noflo"
class Counter extends noflo.Component
    count: null
    description: "The count component receives input on a single input port, and sends the number of data packets received to the output port when the input disconnects"

    constructor: ->
        @count = null
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            count: new noflo.Port()
        @inPorts.in.on "data", (data) =>
            if @count is null
                @count = 0
            @count++
        @inPorts.in.on "disconnect", =>
            @outPorts.count.send @count
            @outPorts.count.disconnect()
            @count = null

exports.getComponent = ->
    new Counter()
