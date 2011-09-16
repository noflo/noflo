noflo = require "noflo"

class Kick extends noflo.Component
    description: "This component generates a single packet and sends in to the output port. Mostly usable for debugging, but can also be useful for starting up networks."

    constructor: ->
        @inPorts = 
            in: new noflo.Port()

        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "disconnect", =>
            @outPorts.out.send null
            @outPorts.out.disconnect()

exports.getComponent = -> new Kick
