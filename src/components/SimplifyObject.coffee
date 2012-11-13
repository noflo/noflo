noflo = require '../../lib/NoFlo'
{_} = require 'underscore'

class SimplifyObject extends noflo.Component
  constructor: ->
    @inPorts =
      in: new noflo.Port
    @outPorts =
      out: new noflo.Port

    @inPorts.in.on 'beginGroup', (group) =>
      @outPorts.out.beginGroup group

    @inPorts.in.on 'data', (data) =>
      @outPorts.out.send @simplify data

    @inPorts.in.on 'endgroup', =>
      @outPorts.out.endGroup()

    @inPorts.in.on 'disconnect', =>
      @outPorts.out.disconnect()

  simplify: (data) ->
    if _.isArray data
      if data.length is 1
        return data[0]
      return data
    unless _.isObject data
      return data

    @simplifyObject data

  simplifyObject: (data) ->
    keys = _.keys data
    if keys.length is 1 and keys[0] is '$data'
      return @simplify data['$data']
    simplified = {}
    _.each data, (value, key) =>
      simplified[key] = @simplify value
    simplified

exports.getComponent = -> new SimplifyObject
