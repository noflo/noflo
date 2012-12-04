events = require "events"

class Component extends events.EventEmitter
  description: ""

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

exports.Component = Component
