noflo = require "noflo"
underscore = require "underscore"
coffee = require "coffee-script"
class Callback extends noflo.Component
    description: ""

    constructor: ->
        component = @
        @callback = null
        @inPorts =
            in: new noflo.Port()
            callback: new noflo.Port()
        @outPorts =
            out: new noflo.Port()
        @inPorts.callback.on "data", (cb) =>
            if typeof cb is "string"
                @callback = eval(coffee.compile cb)
                throw "callback is not a function" unless typeof @callback is "function"
            else
                @callback = cb
            # console.info "test", @callback "test", @outPorts.out
        @inPorts.in.on "data", (data) =>
            if @callback is null
                throw "No callback set yet"
            @callback data, @outPorts.out,
                underscore: underscore
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

exports.getComponent = ->
    new Callback()
