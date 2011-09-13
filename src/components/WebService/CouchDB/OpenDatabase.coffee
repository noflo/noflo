noflo = require "noflo"
couch = require "couch-client"

class OpenDatabase extends noflo.Component
    constructor: ->
        @inPorts =
            url: new noflo.Port()
        @outPorts =
            connection: new noflo.ArrayPort()

        @inPorts.url.on "data", (data) =>
            db = couch data
            @outPorts.connection.send db
            @outPorts.connection.disconnect()

exports.getComponent = -> new OpenDatabase
