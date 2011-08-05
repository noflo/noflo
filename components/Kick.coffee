noflo = require "noflo"

class Kick extends noflo.Component
    description: "This component generates a single packet and sends in to the output port. Mostly usable for debugging, but can also be useful for starting up networks."

    constructor: ->
        @inPorts = {}

        @outPorts =
            out: new noflo.Port()

        @outPorts.out.send null
        @outPorts.out.disconnect()

exports.getComponent = ->
    new Kick()
