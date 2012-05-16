noflo = require 'noflo'

class ReadEnv extends noflo.Component
  constructor: ->
    @inPorts =
      key: new noflo.Port
    @outPorts =
      out: new noflo.ArrayPort
      error: new noflo.Port

    @inPorts.key.on 'data', (data) =>
      return @outPorts.out.send process.env[data] if process.env[data] isnt undefined
      @outPorts.error.send "No environment variable #{data} set" if @outPorts.error.isAttached()

exports.getComponent = -> new ReadEnv
