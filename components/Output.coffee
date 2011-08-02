noflo = require "noflo"

class Output extends noflo.Component

    description: "This component receives input on a single inport, and sends the data items directly to console.log"

    constructor: ->
        @inPorts =
            in: new noflo.ArrayPort()

        @outPorts = {}

        @inPorts.in.on "data", (data) ->
            console.log data

exports.getComponent = ->
    new Output()
