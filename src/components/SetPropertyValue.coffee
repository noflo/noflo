noflo = require "../../lib/NoFlo"

class SetPropertyValue extends noflo.Component
  constructor: ->
    @property = null
    @value = null
    @data = []

    @inPorts =
      property: new noflo.Port()
      value: new noflo.Port()
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.property.on "data", (data) =>
      @property = data
      @addProperties() if @value and @data.length
    @inPorts.value.on "data", (data) =>
      @value = data
      @addProperties() if @property and @data.length

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      return @addProperty data if @property and @value
      @data.push data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect() if @property and @value
      @value = null

  addProperty: (object) ->
    object[@property] = @value
    @outPorts.out.send object

  addProperties: ->
    @addProperty object for object in @data
    @data = []
    @outPorts.out.disconnect()

exports.getComponent = -> new SetPropertyValue
