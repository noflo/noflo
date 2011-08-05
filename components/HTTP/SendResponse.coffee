noflo = require "noflo"

class SendResponse extends noflo.Component
    description: "This component receives a HTTP request (req, res, next) combination on on input, and runs res.end(), sending the response to the user"

    constructor: ->
        @request = null

        @inPorts =
            in: new noflo.Port()

        @inPorts.in.on "data", (request) =>
            @request = request
        @inPorts.in.on "disconnect", =>
            @request.res.end()
            @request = null

exports.getComponent = ->
    new SendResponse()
