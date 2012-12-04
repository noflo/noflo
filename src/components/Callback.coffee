noflo = require '../../lib/NoFlo'

class Callback extends noflo.Component
  constructor: ->
    @callback = null

    @inPorts =
      in: new noflo.Port()
      callback: new noflo.Port()

    @inPorts.callback.on 'data', (data) =>
      @callback = data

    @inPorts.in.on "data", (data) =>
      @callback data

exports.getComponent = -> new Callback
