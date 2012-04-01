events = require "events"

class Component extends events.EventEmitter
    description: ""

    getDescription: ->
        @description

    isReady: ->
        true

exports.Component = Component
