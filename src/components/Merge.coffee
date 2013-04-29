if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class Merge extends noflo.Component
  description: "This component receives data on multiple input ports
  and sends the same data out to the connected output port"

  constructor: ->
    @inPorts =
      in: new noflo.ArrayPort()
    @outPorts =
      out: new noflo.Port()

    @inPorts.in.on "connect", =>
      @outPorts.out.connect()
    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      @outPorts.out.send data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      # Check that all ports have disconnected before emitting
      for socket in @inPorts.in.sockets
        return if socket.connected
      @outPorts.out.disconnect()

exports.getComponent = ->
  new Merge
