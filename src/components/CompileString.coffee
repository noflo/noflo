noflo = require '../../lib/NoFlo'

class CompileString extends noflo.Component

  constructor: ->
    @delimiter = "\n"
    @data = []
    @onGroupEnd = true

    @inPorts =
      delimiter: new noflo.Port
      in: new noflo.ArrayPort
      ongroup: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.delimiter.on 'data', (data) =>
      @delimiter = data

    @inPorts.in.on 'begingroup', (group) =>
      @outPorts.out.beginGroup group

    @inPorts.in.on 'data', (data) =>
      @data.push data

    @inPorts.in.on 'endgroup', =>
      @outPorts.out.send @data.join @delimiter if @data.length and @onGroupEnd
      @outPorts.out.endGroup()
      @data = []

    @inPorts.in.on 'disconnect', =>
      @outPorts.out.send @data.join @delimiter if @data.length
      @data = []
      @outPorts.out.disconnect()

    @inPorts.ongroup.on "data", (data) =>
      if typeof data is 'string'
        if data.toLowerCase() is 'false'
          @onGroupEnd = false
          return
        @onGroupEnd = true
        return
      @onGroupEnd = data

exports.getComponent = -> new CompileString
