noflo = require "noflo"

class CreateDate extends noflo.Component
    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            if data is "now"
                date = new Date
            else
                date = new Date data
            @outPorts.out.send date.toJSON()
            @outPorts.out.disconnect()

exports.getComponent = -> new CreateDate
