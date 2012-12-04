noflo = require "../../lib/NoFlo"

class Drop extends noflo.Component
  description: "This component drops every packet it receives with no action"

  constructor: ->
    @inPorts =
      in: new noflo.Port()

    @outPorts = {}

exports.getComponent = -> new Drop
