noflo = require "../../lib/NoFlo"

class MapPropertyValue extends noflo.Component
  constructor: ->
    @mapAny = {}
    @map = {}
    @regexpAny = {}
    @regexp = {}

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
      @mapAny = map
      return

    mapParts = map.split "="
    if mapParts.length is 3
      @map[mapParts[0]] =
        from: mapParts[1]
        to: mapParts[2]
      return

    @mapAny[mapParts[0]] = mapParts[1]

  prepareRegExp: (map) ->
    mapParts = map.split "="
    if mapParts.length is 3
      @regexp[mapParts[0]] =
        from: mapParts[1]
        to: mapParts[2]
      return
    @regexpAny[mapParts[0]] = mapParts[1]

  mapData: (data) ->
    for property, value of data
      if @map[property] and @map[property].from is value
        data[property] = @map[property].to

      if @mapAny[value]
        data[property] = @mapAny[value]

      if @regexp[property]
        regexp = new RegExp @regexp[property].from
        matched = regexp.exec value
        if matched
          data[property] = value.replace regexp, @regexp[property].to

      for expression, replacement of @regexpAny
        regexp = new RegExp expression
        matched = regexp.exec value
        continue unless matched
        data[property] = value.replace regexp, replacement

    @outPorts.out.send data

exports.getComponent = -> new MapPropertyValue
