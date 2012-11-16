noflo = require '../../lib/NoFlo'

class Group extends noflo.Component
  constructor: ->
    @groups = []
    @newGroups = []
    @threshold = null # How many groups to be saved?

    @inPorts =
      in: new noflo.ArrayPort
      group: new noflo.ArrayPort
      threshold: new noflo.Port
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
      # Get rid of groups in the past to make room for the new one
      if @threshold
        diff = @newGroups.length - @threshold + 1
        if diff > 0
          @newGroups = @newGroups.slice(diff)

      @newGroups.push data

    @inPorts.threshold.on 'data', (@threshold) =>

exports.getComponent = -> new Group
