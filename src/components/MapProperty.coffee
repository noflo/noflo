noflo = require "noflo"

class MapProperty extends noflo.Component
    constructor: ->
        @map = {}

        @inPorts =
            map: new noflo.ArrayPort()
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.map.on "data", (data) =>
            @prepareMap data

        @inPorts.in.on "begingroup", (group) =>
            @outPorts.out.beginGroup group
        @inPorts.in.on "data", (data) =>
            @mapData data
        @inPorts.in.on "endgroup", =>
            @outPorts.out.endGroup()
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

    prepareMap: (map) ->
        if typeof map is "object"
            @map = map
            return

        mapParts = map.split "="
        @map[mapParts[0]] = mapParts[1]

    mapData: (data) ->
        newData = {}
        for property, value of data
            if @map[property]
                property = @map[property]
            newData[property] = value
        @outPorts.out.send newData

exports.getComponent = -> new MapProperty
