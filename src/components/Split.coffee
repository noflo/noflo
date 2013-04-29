if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class Split extends noflo.Component
  description: "This component receives data on a single input port and sends
the same data out to all connected output ports"

  constructor: ->
    @inPorts =
      in: new noflo.Port 'all'
    @outPorts =
      out: new noflo.ArrayPort 'all'

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
