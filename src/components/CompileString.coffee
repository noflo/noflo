noflo = require 'noflo'

class CompileString extends noflo.Component

  constructor: ->
    @delimiter = ''
    @data = []

    @inPorts = 
      delimiter: new noflo.Port
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.delimiter.on 'data', (data) =>
      @delimiter = data

    @inPorts.in.on 'data', (data) =>
      @data.push data

    @inPorts.in.on 'endgroup', =>
      @outPorts.out.send @data.join @delimiter if @data.length
      @data = []

    @inPorts.in.on 'disconnect', =>
      @outPorts.out.send @data.join @delimiter if @data.length
      @data = []
      @outPorts.out.disconnect()

exports.getComponent = -> new CompileString
