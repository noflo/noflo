noflo = require "noflo"

class FilterPropertyValue extends noflo.Component
    constructor: ->
        @accepts = {}
        @regexps = {}

        @inPorts =
            accept: new noflo.ArrayPort()
            regexp: new noflo.ArrayPort()
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.accept.on "data", (data) =>
            @prepareAccept data
        @inPorts.regexp.on "data", (data) =>
            @prepareRegExp data

        @inPorts.in.on "begingroup", (group) =>
            @outPorts.out.beginGroup group
        @inPorts.in.on "data", (data) =>
            @filterData data
        @inPorts.in.on "endgroup", =>
            @outPorts.out.endGroup()
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

    prepareAccept: (map) ->
        if typeof map is "object"
            @accepts = map
            return

        mapParts = map.split "="
        @accepts[mapParts[0]] = mapParts[1]

    prepareRegExp: (map) ->
        mapParts = map.split "="
        @regexps[mapParts[0]] = mapParts[1]

    filterData: (object) ->
        newData = {}
        match = false
        for property, value of object
            if @accepts[property] and @accepts[property] isnt value
                continue

            if @regexps[property]
                regexp = new RegExp @regexps[property]
                unless regexp.exec value
                    continue

            newData[property] = value
            match = true
            continue

        return unless match
        @outPorts.out.send newData

exports.getComponent = -> new FilterPropertyValue
