noflo = require "noflo"
couch = require "couch-client"

class WriteDocument extends noflo.Component
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
            @saveObject data for data in @data

        @inPorts.in.on "data", (data) =>
            return @saveObject data if @connection
            @data.push data
        @inPorts.in.on "disconnect", =>
            return unless @outPorts.out.isAttached()
            for port in @inPorts.in
                return if port.isConnected()
            @outPorts.out.disconnect() 

    saveObject: (object) ->
        @connection.save object, (err, document) =>
            return console.error err if err
            return unless @outPorts.out.isAttached()
            @outPorts.out.send document

exports.getComponent = -> new WriteDocument
