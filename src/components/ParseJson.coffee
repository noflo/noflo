noflo = require 'noflo'

class ParseJson extends noflo.Component
    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @outPorts.out.send JSON.parse data
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

exports.getComponent = -> new ParseJson
