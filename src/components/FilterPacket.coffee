noflo = require "../../lib/NoFlo"

class FilterPacket extends noflo.Component
  constructor: ->
    @regexps = []

    @inPorts =
      regexp: new noflo.ArrayPort()
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      missed: new noflo.Port()

    @inPorts.regexp.on "data", (data) =>
      @regexps.push data

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      return @filterData data if @regexps.length
      @outPorts.out.send data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()
      @outPorts.missed.disconnect()

  filterData: (data) ->
    match = false
    for expression in @regexps
      regexp = new RegExp expression
      continue unless regexp.exec data
      match = true

    unless match
      @outPorts.missed.send data if @outPorts.missed.isAttached()
      return

    @outPorts.out.send data

exports.getComponent = -> new FilterPacket
