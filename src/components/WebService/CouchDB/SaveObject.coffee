noflo = require "noflo"
couch = require "couch-client"

class SaveObject extends noflo.Component
    constructor: ->
        @request = null
        @database = "default"
        @connection = null
        @data = []

        @inPorts =
            in: new noflo.ArrayPort()
            database: new noflo.Port()
            connection: new noflo.Port()

        @inPorts.connection.on "data", (data) =>
            @connection = data
        @inPorts.connection.on "disconnect", =>
            return unless @data.length
            saveObject data for data in @data
        
        @inPorts.in.on "begingroup", (group) =>
            do @openRequest
        @inPorts.in.on "data", (data) =>
            return @saveObject data if @connection
            @data.push data
        @inPorts.in.on "endgroup", =>
            @request = null

    openRequest: ->
        return if @request
        throw new "No CouchDB connection available" unless @connection
        @request = @connection.request "PUT", "/#{@database}", (err, result) ->
            console.error err if err

    saveObject: (object) ->
        do @openRequest unless @request

        @connection.save object, (err, result) ->
            console.error err if err

exports.getComponent = -> new SaveObject
