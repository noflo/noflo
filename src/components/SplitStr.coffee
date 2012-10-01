# The SplitStr component receives a string in the in port, splits it by
# string specified in the delimiter port, and send each part as a separate
# packet to the out port

noflo = require "noflo"

class SplitStr extends noflo.Component
    constructor: ->
        @delimiterString = "\n"
        @string = ""

        @inPorts =
            in: new noflo.Port()
            delimiter: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.delimiter.on "data", (data) =>
            @delimiterString = data
        @inPorts.in.on "data", (data) =>
            @string += data
        @inPorts.in.on "disconnect", (data) =>
            @string.split(@delimiterString).forEach (line) =>
                @outPorts.out.send line
            @outPorts.out.disconnect()
            @string = ""

exports.getComponent = ->
    new SplitStr()
