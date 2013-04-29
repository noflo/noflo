if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class Kick extends noflo.Component
  description: "This component generates a single packet and sends
  it to the output port. Mostly usable for debugging, but can also
  be useful for starting up networks."

  constructor: ->
    @data =
      packet: null
      group: []
    @groups = []

    @inPorts =
      in: new noflo.Port()
      data: new noflo.Port()

    @outPorts =
      out: new noflo.ArrayPort()

    @inPorts.in.on 'begingroup', (group) =>
      @groups.push group

    @inPorts.in.on 'data', =>
      @data.group = @groups.slice 0

    @inPorts.in.on 'endgroup', (group) =>
      @groups.pop()

    @inPorts.in.on 'disconnect', =>
      @sendKick @data
      @groups = []

    @inPorts.data.on 'data', (data) =>
      @data.packet = data

  sendKick: (kick) ->
    for group in kick.group
      @outPorts.out.beginGroup group

    @outPorts.out.send kick.packet

    for group in kick.group
      @outPorts.out.endGroup()

    @outPorts.out.disconnect()

exports.getComponent = -> new Kick
