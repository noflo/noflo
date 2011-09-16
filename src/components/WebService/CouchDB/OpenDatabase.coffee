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
            @createDatabase db, @outPorts.connection

    createDatabase: (connection, outPort) ->
        connection.request "PUT", "/#{connection.uri.pathname}", (err, result) ->
            console.error err if err
            outPort.send connection
            outPort.disconnect()

exports.getComponent = -> new OpenDatabase
