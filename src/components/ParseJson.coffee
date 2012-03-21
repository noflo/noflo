noflo = require 'noflo'

class ParseJson extends noflo.Component
    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        json = ""
        @inPorts.in.on "data", (data) ->
            json += data
        @inPorts.in.on "disconnect", =>
            @outPorts.out.send JSON.parse json
            @outPorts.out.disconnect()

exports.getComponent = -> new ParseJson
