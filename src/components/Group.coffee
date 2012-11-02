noflo = require 'noflo'

class Group extends noflo.Component
  constructor: ->
    @groups = []
    @newGroups = []

    @inPorts =
      in: new noflo.ArrayPort
      group: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'connect', () =>
      @outPorts.out.beginGroup group for group in @newGroups

    @inPorts.in.on 'begingroup', (group) =>
      @outPorts.out.beginGroup group

    @inPorts.in.on 'data', (data) =>
      @outPorts.out.send data

    @inPorts.in.on 'endgroup', (group) =>
      @outPorts.out.endGroup()

    @inPorts.in.on 'disconnect', () =>
      @outPorts.out.endGroup() for group in @newGroups
      @outPorts.out.disconnect()
      @groups = []

    @inPorts.group.on 'data', (data) =>
      @newGroups.push data

exports.getComponent = -> new Group
