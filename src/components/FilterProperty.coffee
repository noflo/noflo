noflo = require "../../lib/NoFlo"

class FilterProperty extends noflo.Component
  constructor: ->
    @accepts = []
    @regexps = []

    @inPorts =
      accept: new noflo.ArrayPort()
      regexp: new noflo.ArrayPort()
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.accept.on "data", (data) =>
      @accepts.push data
    @inPorts.regexp.on "data", (data) =>
      @regexps.push data

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      @filterData data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

  filterData: (object) ->
    newData = {}
    match = false
    for property, value of object
      if @accepts.indexOf(property) isnt -1
        newData[property] = value
        match = true
        continue

      for expression in @regexps
        regexp = new RegExp expression
        if regexp.exec property
          newData[property] = value
          match = true

    return unless match
    @outPorts.out.send newData

exports.getComponent = -> new FilterProperty
