noflo = require "../../lib/NoFlo"

class Replace extends noflo.Component
  constructor: ->
    @pattern = null
    @replacement = ""

    @inPorts =
      in: new noflo.Port()
      pattern: new noflo.Port()
      replacement: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.pattern.on "data", (data) =>
      @pattern = new RegExp(data, 'g')
    @inPorts.replacement.on "data", (data) =>
      @replacement = data

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      string = data
      if @pattern?
        string = data.replace @pattern, @replacement
      @outPorts.out.send string
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

exports.getComponent = -> new Replace
