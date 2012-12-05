noflo = require "../../lib/NoFlo"

class Split extends noflo.Component
  description: "This component receives data on a single input port and sends the same data out to all connected output ports"

  constructor: ->
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.ArrayPort()

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

exports.getComponent = ->
  new Split
