noflo = require "../../lib/NoFlo"

class MapGroup extends noflo.Component
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
      @mapGroup group
    @inPorts.in.on "data", (data) =>
      @outPorts.out.send data
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

  mapGroup: (group) ->
    if @map[group]
      @outPorts.out.beginGroup @map[group]
      return

    for expression, replacement of @regexps
      regexp = new RegExp expression
      matched = regexp.exec group
      continue unless matched
      group = group.replace regexp, replacement

    @outPorts.out.beginGroup group

exports.getComponent = -> new MapGroup
