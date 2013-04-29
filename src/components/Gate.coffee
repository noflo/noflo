if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class Gate extends noflo.Component
  description: 'This component forwards received packets when the gate is open'

  constructor: ->
    @open = false

    @inPorts =
      in: new noflo.Port
      open: new noflo.Port
      close: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'connect', =>
      return unless @open
      @outPorts.out.connect()
    @inPorts.in.on 'begingroup', (group) =>
      return unless @open
      @outPorts.out.beginGroup group
    @inPorts.in.on 'data', (data) =>
      return unless @open
      @outPorts.out.send data
    @inPorts.in.on 'endgroup', =>
      return unless @open
      @outPorts.out.endGroup()
    @inPorts.in.on 'disconnect', =>
      return unless @open
      @outPorts.out.disconnect()

    @inPorts.open.on 'data', =>
      @open = true
    @inPorts.close.on 'data', =>
      @open = false

exports.getComponent = -> new Gate
