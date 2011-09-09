noflo = require "noflo"

class CollectGroups extends noflo.Component
    description: "Deserializes a flow of groups into a JSON object. The group names are "
    constructor: ->
        @data = {}
        @keys = []
        @currentData = {}
        @parentData = []

        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "connect", =>
            @data = {}
        @inPorts.in.on "begingroup", (group) =>
            if @keys.length
                @parentData.push @currentData
            @keys.push group
            @currentData = {}
        @inPorts.in.on "data", (data) =>
            @setData data
        @inPorts.in.on "endgroup", =>
            group = @keys.pop()
            @setToParent group, @currentData
            @currentData = {}
        @inPorts.in.on "disconnect", =>
            @outPorts.out.send @data
            @outPorts.out.disconnect()

    setToParent: (group, data) ->
        unless @parentData.length
            @data[group] = data
            return
        @parentData.push data
        @parentData[@parentData.length - 2][group] = @parentData.pop()

    setData: (data) ->
        if typeof data is "object"
            if toString.call(data) is '[object Array]' 
                for value, index in data
                    @currentData[index] = value
                return
            for value, key of data
                @currentData[key] = value
            return

        @currentData['value'] = data

exports.getComponent = -> new CollectGroups
