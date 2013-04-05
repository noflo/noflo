noflo = require "../../lib/NoFlo"

class CollectGroups extends noflo.Component
  description: 'Collect packets into object keyed by its groups'
  constructor: ->
    @data = {}
    @groups = []
    @parents = []

    @inPorts =
      in: new noflo.Port 'all'
    @outPorts =
      out: new noflo.Port 'object'
      error: new noflo.Port 'object'

    @inPorts.in.on "connect", =>
      @data = {}
    @inPorts.in.on "begingroup", (group) =>
      if group is '$data'
        @error 'groups cannot be named "$data"'
        return
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

  error: (msg) ->
    if @outPorts.error.isAttached()
      @outPorts.error.send new Error msg
      @outPorts.error.disconnect()
      return
    throw new Error msg

exports.getComponent = -> new CollectGroups
