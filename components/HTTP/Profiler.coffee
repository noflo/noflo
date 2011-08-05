noflo = require "noflo"
connect = require "connect"

class Profiler extends noflo.Component
    description: "This component receives a HTTP request (req, res) combination on on input, and runs the connect.profiler middleware for that"

    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (request) =>
            connect.profiler() request.req, request.res, =>
                @outPorts.out.send request
                @outPorts.out.disconnect()

exports.getComponent = ->
    new Profiler()
