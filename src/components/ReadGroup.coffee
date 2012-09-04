noflo = require 'noflo'

class ReadGroup extends noflo.Component
  constructor: ->
    @groups = []

    @inPorts =
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'begingroup', (group) =>
      @groups.push group
    @inPorts.in.on 'data', =>
      return unless @groups.length
      @outPorts.out.send @groups.join ':'
    @inPorts.in.on 'endgroup', =>
      @groups.pop()
    @inPorts.in.on 'disconnect', =>
      @outPorts.out.disconnect()

exports.getComponent = -> new ReadGroup
