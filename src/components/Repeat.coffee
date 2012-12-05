noflo = require "../../lib/NoFlo"

class Repeat extends noflo.Component

  constructor: ->
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.in.on "connect", =>
      @outPorts.out.connect()
    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      @outPorts.out.send data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

exports.getComponent = -> new Repeat()
