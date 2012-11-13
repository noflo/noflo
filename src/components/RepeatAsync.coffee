noflo = require "../../lib/NoFlo"
util = require "util"

class RepeatAsync extends noflo.Component

  description: "Like 'Repeat', except repeat on next tick"

  constructor: ->
    @groups = []

    # Ports
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    # Forward on next tick
    @inPorts.in.on "begingroup", (group) =>
      @groups.push(group)

    @inPorts.in.on "data", (data) =>
      groups = @groups

      later = () =>
        for group in groups
          @outPorts.out.beginGroup(group)

        @outPorts.out.send(data)

        for group in groups
          @outPorts.out.endGroup()

        @outPorts.out.disconnect()

      setTimeout(later, 0)

    @inPorts.in.on "disconnect", () =>
      @groups = []



exports.getComponent = () -> new RepeatAsync
