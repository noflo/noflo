noflo = require "../../lib/NoFlo"

class FlattenObject extends noflo.Component
  constructor: ->
    @map = {}
    @inPorts =
      map: new noflo.ArrayPort()
      in: new noflo.Port()
    @outPorts =
       out: new noflo.Port()

    @inPorts.map.on "data", (data) =>
      @prepareMap data

    @inPorts.in.on "begingroup", (group) =>
      @outPorts.out.beginGroup group
    @inPorts.in.on "data", (data) =>
      for object in @flattenObject data
        @outPorts.out.send @mapKeys object
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

  mapKeys: (object) ->
    for key, map of @map
      object[map] = object.flattenedKeys[key]
    delete object.flattenedKeys
    return object

  flattenObject: (object) ->
    flattened = []
    for key, value of object
      if typeof value is "object"
        flattenedValue = @flattenObject value
        for val in flattenedValue
          val.flattenedKeys.push key
          flattened.push val
        continue

      flattened.push
        flattenedKeys: [key]
        value: value

    return flattened

exports.getComponent = -> new FlattenObject
