noflo = require "noflo"

class JSONParse extends noflo.Component

    description: "This component receives a Json String on a single inport, parses it and sends the data object to the out port."

    constructor: ->
        @inPorts =
            in: new noflo.ArrayPort()

        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @outPorts.out.send JSON.parse data

exports.getComponent = ->
    new JSONParse()
