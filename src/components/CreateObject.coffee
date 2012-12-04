noflo = require "../../lib/NoFlo"

class CreateObject extends noflo.Component
  constructor: ->
    @inPorts =
      start: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.start.on "data", =>
      @outPorts.out.send {}
      @outPorts.out.disconnect()

exports.getComponent = -> new CreateObject
