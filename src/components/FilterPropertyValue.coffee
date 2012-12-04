noflo = require "../../lib/NoFlo"

class FilterPropertyValue extends noflo.Component
  constructor: ->
    @accepts = {}
    @regexps = {}

    @inPorts =
      accept: new noflo.ArrayPort()
      regexp: new noflo.ArrayPort()
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.accept.on "data", (data) =>
      @prepareAccept data
    @inPorts.regexp.on "data", (data) =>
      @prepareRegExp data

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      return @filterData data if @filtering()
      @outPorts.out.send data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

  filtering: ->
    return ((Object.keys @accepts).length > 0 or
        (Object.keys @regexps).length > 0)

  prepareAccept: (map) ->
    if typeof map is "object"
      @accepts = map
      return

    mapParts = map.split "="
    try
      @accepts[mapParts[0]] = eval mapParts[1]
    catch e
      if e instanceof ReferenceError
        @accepts[mapParts[0]] = mapParts[1]
      else throw e

  prepareRegExp: (map) ->
    mapParts = map.split "="
    @regexps[mapParts[0]] = mapParts[1]

  filterData: (object) ->
    newData = {}
    match = false
    for property, value of object
      if @accepts[property]
        continue unless @accepts[property] is value
        match = true

      if @regexps[property]
        regexp = new RegExp @regexps[property]
        continue unless regexp.exec value
        match = true

      newData[property] = value
      continue

    return unless match
    @outPorts.out.send newData

exports.getComponent = -> new FilterPropertyValue
