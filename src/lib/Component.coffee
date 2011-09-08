events = require "events"

class Component extends events.EventEmitter
    inPorts: {}
    outPorts: {}
    description: ""

    getDescription: ->
        @description

    isReady: ->
        true

exports.Component = Component
