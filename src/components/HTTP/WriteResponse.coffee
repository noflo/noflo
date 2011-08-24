noflo = require "noflo"

class WriteResponse extends noflo.Component
    description: "This component receives a request and a string on the input ports, writes that string to the request's response and forwards the request"

    constructor: ->
        @string = ""
        @request = null

        @inPorts =
            string: new noflo.Port()
            in: new noflo.Port()

        @outPorts =
            out: new noflo.Port()

        @inPorts.string.on "connect", =>
            @string = ""
        @inPorts.string.on "data", (data) =>
            @string += data
        @inPorts.string.on "disconnect", =>
            @outPorts.out.connect() if @request

        @inPorts.in.on "data", (data) =>
            @request = data
        @inPorts.in.on "disconnect", =>
            @outPorts.out.connect() if @string

        @outPorts.out.on "connect", =>
            @request.res.write @string
            @outPorts.out.send @request
            @request = null
            @string = null
            @outPorts.out.disconnect()

exports.getComponent = ->
    new WriteResponse()
