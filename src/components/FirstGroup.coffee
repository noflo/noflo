noflo = require "../../lib/NoFlo"

class FirstGroup extends noflo.Component
  constructor: ->
    @depth = 0

    @inPorts =
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'begingroup', (group) =>
      @outPorts.out.beginGroup group if @depth is 0
      @depth++

    @inPorts.in.on 'data', (data) =>
      @outPorts.out.send data

    @inPorts.in.on 'endgroup', (group) =>
      @depth--
      @outPorts.out.endGroup() if @depth is 0

    @inPorts.in.on 'disconnect', =>
      @depth = 0
      @outPorts.out.disconnect()

exports.getComponent = -> new FirstGroup
