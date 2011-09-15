noflo = require "noflo"

class Merge extends noflo.Component
    description: "This component receives data on multiple input ports and sends the same data out to the connected output port"

    constructor: ->
        @inPorts =
            in: new noflo.ArrayPort()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "begingroup", (group) =>
            @outPorts.out.beginGroup group
        @inPorts.in.on "data", (data) =>
            @outPorts.out.send data
        @inPorts.in.on "endgroup", =>
            @outPorts.out.endGroup()
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

exports.getComponent = ->
    new Merge
