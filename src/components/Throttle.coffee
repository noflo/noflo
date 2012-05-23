noflo = require "noflo"
util = require "util"

class Throttle extends noflo.Component

    constructor: ->
        @inPorts =
            in: new noflo.Port()
            load: new noflo.Port()
            max: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @q = []
        @load = 0
        @max = 10

        @inPorts.load.on "data", (data) =>
            @load = data
            @process()

        @inPorts.max.on "data", (data) =>
            @max = data
            @process()

        @inPorts.in.on "begingroup", (group) =>
            @push "begingroup", group
        @inPorts.in.on "data", (data) =>
            @push "data", data
        @inPorts.in.on "endgroup", =>
            @push "endgroup"
        @inPorts.in.on "disconnect", =>
            @push "disconnect"

    push: (eventname, data) ->
        @q.push { name: eventname, data: data }
        @process()

    process: ->
        while @q.length > 0 and @load < @max
            event = @q.shift()
            switch event.name
                when "begingroup" then @outPorts.out.beginGroup event.data
                when "data" then @outPorts.out.send event.data
                when "endgroup" then @outPorts.out.endGroup()
                when "disconnect" then @outPorts.out.disconnect()

exports.getComponent = -> new Throttle()
