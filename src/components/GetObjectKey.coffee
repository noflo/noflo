noflo = require "noflo"

class GetObjectKey extends noflo.Component
    description: "Filtering the elements with a specific KEY from the flow of data objects."
    constructor: ->
        @data = []
        @key = null

        @inPorts =
            in: new noflo.Port()
            key: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "connect", =>
            @data = []
        @inPorts.in.on "begingroup", (group) =>
            @outPorts.out.beginGroup group
        @inPorts.in.on "data", (data) =>
            return @getKey data if @key
            @data.push data
        @inPorts.in.on "endgroup", =>
            @outPorts.out.endGroup()
        @inPorts.in.on "disconnect", =>
            unless @data.length
                # Data already sent
                @outPorts.out.disconnect()
                return

            # No key, data will be sent when we get it
            return unless @key

            # Otherwise send data we have an disconnect
            @getKey data for data in @data
            @outPorts.out.disconnect()

        @inPorts.key.on "data", (data) =>
            @key = data
        @inPorts.key.on "disconnect", =>
            return unless @data.length

            @getKey data for data in @data
            @outPorts.out.disconnect()

    getKey: (data) ->
        throw "Key not defined" unless @key
        throw "Data is not an object" unless typeof data is "object"
        @outPorts.out.send data[@key]

exports.getComponent = ->
    new GetObjectKey
