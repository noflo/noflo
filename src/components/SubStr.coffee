noflo = require '../../lib/NoFlo'

class SubStr extends noflo.Component
  constructor: ->
    @index = 0
    @limit = undefined

    @inPorts =
      index: new noflo.Port
      limit: new noflo.Port
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.index.on 'data', (data) =>
      @index = data
    @inPorts.limit.on 'data', (data) =>
      @limit = data
    @inPorts.in.on 'data', (data) =>
      @outPorts.out.send data.substr @index, @limit
    @inPorts.in.on 'disconnect', =>
      @outPorts.out.disconnect()

exports.getComponent = -> new SubStr
