noflo = require '../../lib/NoFlo'

class ReadGroup extends noflo.Component
  constructor: ->
    @groups = []

    @inPorts =
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port
      group: new noflo.Port

    @inPorts.in.on 'begingroup', (group) =>
      @groups.push group
      @outPorts.group.beginGroup group
      @outPorts.out.beginGroup group if @outPorts.out.isAttached()
    @inPorts.in.on 'data', (data) =>
      @outPorts.out.send data if @outPorts.out.isAttached()
      return unless @groups.length
      @outPorts.group.send @groups.join ':'
    @inPorts.in.on 'endgroup', =>
      @groups.pop()
      @outPorts.group.endGroup()
      @outPorts.out.endGroup() if @outPorts.out.isAttached()
    @inPorts.in.on 'disconnect', =>
      @outPorts.out.disconnect()
      @outPorts.group.disconnect()

exports.getComponent = -> new ReadGroup
