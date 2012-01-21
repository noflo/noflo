noflo = require "noflo"

class Replace extends noflo.Component
    constructor: ->
        @pattern = null
        @replacement = ""
        @string = ""

        @inPorts =
            in: new noflo.Port()
            pattern: new noflo.Port()
            replacement: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.pattern.on "data", (data) =>
            @pattern = new RegExp(data, 'g')
        @inPorts.replacement.on "data", (data) =>
            @replacement = data
        @inPorts.in.on "data", (data) =>
            @string += data
        @inPorts.in.on "disconnect", =>
            newString = @string
            if @pattern?
                newString = @string.replace @pattern, @replacement
            @outPorts.out.send newString
            @outPorts.out.disconnect()
            @string = ""

exports.getComponent = -> new Replace
