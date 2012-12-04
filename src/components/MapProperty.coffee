noflo = require "../../lib/NoFlo"

class MapProperty extends noflo.Component
  constructor: ->
    @map = {}
    @regexps = {}

    @inPorts =
      map: new noflo.ArrayPort()
      regexp: new noflo.ArrayPort()
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.map.on "data", (data) =>
      @prepareMap data
    @inPorts.regexp.on "data", (data) =>
      @prepareRegExp data

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      @mapData data
    @inPorts.in.on "endgroup", =>
      @outPorts.out.endGroup()
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

  prepareMap: (map) ->
    if typeof map is "object"
      @map = map
      return

    mapParts = map.split "="
    @map[mapParts[0]] = mapParts[1]

  prepareRegExp: (map) ->
    mapParts = map.split "="
    @regexps[mapParts[0]] = mapParts[1]

  mapData: (data) ->
    newData = {}
    for property, value of data
      if property of @map
        property = @map[property]

      for expression, replacement of @regexps
        regexp = new RegExp expression
        matched = regexp.exec property
        continue unless matched

        property = property.replace regexp, replacement

      if property of newData
        if Array.isArray newData[property]
          newData[property].push value
        else
          newData[property] = [newData[property], value]
      else
        newData[property] = value
    @outPorts.out.send newData

exports.getComponent = -> new MapProperty
