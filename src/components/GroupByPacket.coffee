noflo = require "../../lib/NoFlo"

class GroupByPacket extends noflo.Component
  constructor: ->
    @packets = 0

    @inPorts =
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
      @packets = 0
    @inPorts.in.on "data", (data) =>
      @outPorts.out.beginGroup @packets
      @outPorts.out.send data
      @outPorts.out.endGroup()
      @packets++
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @packets = 0
      @outPorts.out.disconnect()

exports.getComponent = -> new GroupByPacket
