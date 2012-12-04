noflo = require "../../lib/NoFlo"

class UniqueArray extends noflo.Component
  constructor: ->
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.in.on "data", (data) =>
      @outPorts.out.send @unique data
    @inPorts.in.on "disconnect", =>
      @outPorts.out.disconnect()

  unique: (array) ->
    seen = {}
    newArray = []
    for member in array
      seen[member] = member
    for member of seen
      newArray.push member
    return newArray

exports.getComponent = -> new UniqueArray
