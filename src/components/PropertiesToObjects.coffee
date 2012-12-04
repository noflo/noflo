noflo = require "../../lib/NoFlo"

class PropertiesToObjects extends noflo.Component

  constructor: ->
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      @convert data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

  convert: (object) ->
    data = {}
    for property, objects of object
      for id, value of objects
        data[id] = {} unless data[id]
        data[id][property] = value
    @outPorts.out.send data

exports.getComponent = -> new PropertiesToObjects
