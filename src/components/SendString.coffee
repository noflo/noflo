noflo = require '../../lib/NoFlo'

class SendString extends noflo.Component
  constructor: ->
    @string = ''
    @inPorts =
      string: new noflo.Port
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.string.on 'data', (data) =>
      @string = data

    @inPorts.in.on 'data', (data) =>
      @outPorts.out.send @string

    @inPorts.in.on 'disconnect', =>
      @outPorts.out.disconnect()

exports.getComponent = -> new SendString
