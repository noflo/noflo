noflo = require "noflo"

class CollectGroups extends noflo.Component
    description: "Deserializes a flow of groups into a JSON object."
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
            if @parentData.length
                @currentData = @parentData.pop()
                return
            @currentData = @data
        @inPorts.in.on "disconnect", =>
            @outPorts.out.send @data
            @outPorts.out.disconnect()

    setToParent: (group, data) ->
        unless @parentData.length
            @data[group] = data
            return
        @setDataToKey @parentData[@parentData.length - 1], group, data

    setData: (data) ->
        if typeof data is "object"
            if toString.call(data) is '[object Array]' 
                for value, index in data
                    @setDataToKey @currentData, index, value
                return
            for key, value of data
                @setDataToKey @currentData, key, value
            return

        @setDataToKey @currentData, 'value', data

    setDataToKey: (target, key, value) ->
        unless target[key]
            return target[key] = value

        unless typeof target[key] is "object"
            target[key] =
                value: target[key]
            return @setDataToKey target, key, value

        if typeof value is "object"
            if toString.call(value) is '[object Array]' 
                for val, index in value
                    @setDataToKey target[key], index, val
                return
            for subKey, val of value
                @setDataToKey target[key], subKey, val
            return
        target[key].value = value

exports.getComponent = -> new CollectGroups
