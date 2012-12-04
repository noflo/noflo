noflo = require "../../lib/NoFlo"
assert = require "assert"

class CollectGroups extends noflo.Component
  constructor: ->
    @data = {}
    @groups = []
    @parents = []

    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()

    @inPorts.in.on "connect", =>
      @data = {}
    @inPorts.in.on "begingroup", (group) =>
      throw new Error "groups cannot be named '$data'" if group == "$data"
      @parents.push @data
      @groups.push group
      @data = {}
    @inPorts.in.on "data", (data) =>
      @setData data
    @inPorts.in.on "endgroup", =>
      data = @data
      @data = @parents.pop()
      @addChild @data, @groups.pop(), data
    @inPorts.in.on "disconnect", =>
      @outPorts.out.send @data
      @outPorts.out.disconnect()

  addChild: (parent, child, data) ->
    return parent[child] = data unless child of parent
    return parent[child].push data if Array.isArray parent[child]
    parent[child] = [ parent[child], data ]

  setData: (data) ->
    @data.$data = [] unless "$data" of @data
    @data.$data.push data

  setDataToKey: (target, key, value) ->
    target[key].value = value

exports.getComponent = -> new CollectGroups
