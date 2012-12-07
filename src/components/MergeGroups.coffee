noflo = require "../../lib/NoFlo"
{_} = require 'underscore'

class MergeGroups extends noflo.Component
  constructor: ->
    @groups = {}
    @data = {}
    @inPorts =
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.ArrayPort

    @inPorts.in.on 'begingroup', (group, socket) =>
      @addGroup socket, group
    @inPorts.in.on 'data', (data, socket) =>
      @registerData socket, data
      @checkBuffer socket
    @inPorts.in.on 'endgroup', (group, socket) =>
      @checkBuffer socket
      @removeGroup socket
    @inPorts.in.on 'disconnect', (socket, socketId) =>
      @checkBuffer socketId

  addGroup: (socket, group) ->
    unless @groups[socket]
      @groups[socket] = []
    @groups[socket].push group

  removeGroup: (socket) ->
    @groups[socket].pop()

  groupId: (socket) ->
    return null unless @groups[socket]
    @groups[socket].join ':'

  registerData: (socket, data) ->
    id = @groupId socket
    unless id
      return
    unless @data[id]
      @data[id] = {}
    @data[id][socket] = data

  checkBuffer: (socket) ->
    id = @groupId socket
    return unless id
    return unless @data[id]

    for socket, socketId in @inPorts.in.sockets
      return unless @data[id][socketId]

    @outPorts.out.beginGroup id
    @outPorts.out.send @data[id]
    @outPorts.out.endGroup()
    @outPorts.out.disconnect()
    delete @data[id]

exports.getComponent = -> new MergeGroups
