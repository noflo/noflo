noflo = require "noflo"
couch = require "couch-client"

class ReadDocument extends noflo.Component
    constructor: ->
        @request = null
        @connection = null
        @data = []

        @inPorts =
            in: new noflo.ArrayPort()
            connection: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.connection.on "data", (data) =>
            @connection = data
            return unless @data.length
            @loadObject data for data in @data

        @inPorts.in.on "data", (data) =>
            return @loadObject data if @connection
            @data.push data

    loadObject: (object) ->
        @connection.get object, (err, document) =>
            return console.error err if err
            return unless @outPorts.out.isAttached()
            @outPorts.out.send document

exports.getComponent = -> new ReadDocument
