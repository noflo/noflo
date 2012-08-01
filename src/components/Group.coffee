noflo = require 'noflo'

class Group extends noflo.Component
  constructor: ->
    groups = []

    @inPorts =
      in: new noflo.ArrayPort
      group: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'data', (data) =>
      @outPorts.out.beginGroup group for group in groups
      @outPorts.out.send data
      @outPorts.out.endGroup() for group in groups

    @inPorts.group.on 'data', (data) =>
      groups.push data

    @inPorts.in.on "disconnect", () =>
      @outPorts.out.disconnect()

exports.getComponent = -> new Group
