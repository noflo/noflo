noflo = require "../../lib/NoFlo"

class SplitInSequence extends noflo.Component
  constructor: ->
    @lastSent = null

    @inPorts =
      in: new noflo.Port
    @outPorts =
      out: new noflo.ArrayPort

    @inPorts.in.on 'data', (data) =>
      @sendToPort @portId(), data

    @inPorts.in.on 'disconnect', =>
      @outPorts.out.disconnect()

  portId: ->
    if @lastSent is null
      return 0
    next = @lastSent + 1
    if next > @outPorts.out.sockets.length - 1
      return 0
    return next
     
  sendToPort: (portId, data) ->
    @outPorts.out.send data, portId
    @lastSent = portId

exports.getComponent = -> new SplitInSequence
