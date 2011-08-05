noflo = require "noflo"
connect = require "connect"

class BasicAuth extends noflo.Component
    description: "This component receives a HTTP request (req, res) combination on input, and runs the connect.basicAuth middleware for that"

    constructor: ->
        @request = null

        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (request) =>
            @request = request
        @inPorts.in.on "disconnect", =>
            connect.basicAuth(@authenticate) @request.req, @request.res, =>
                @outPorts.out.send @request
                @request = null
                @outPorts.out.disconnect()

    authenticate: (login, password) ->
        login is "user" and password is "pass"

exports.getComponent = ->
    new BasicAuth()
