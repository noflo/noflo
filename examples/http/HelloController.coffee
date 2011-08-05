noflo = require "noflo"

class HelloController extends noflo.Component
    description: "Simple controller that says hello, user"

    constructor: ->
        @request = null

        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()
            data: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @request = data
        @inPorts.in.on "disconnect", (data) =>
            @outPorts.out.send @request
            @outPorts.out.disconnect()

            @outPorts.data.send
                locals:
                    string: "Hello, #{@request.req.remoteUser}"
            @request = null
            @outPorts.data.disconnect()

exports.getComponent = ->
    new HelloController()
