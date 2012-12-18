noflo = require '../../lib/NoFlo'

class CollectUntilIdle extends noflo.Component
  constructor: ->
    @milliseconds = 500
    @data = []
    @groups = []
    @timeout = null

    @inPorts =
      in: new noflo.Port
      timeout: new noflo.Port
    @outPorts =
      out: new noflo.Port
    
    @inPorts.timeout.on 'data', (data) =>
      @milliseconds = parseInt data

    @inPorts.in.on 'connect', =>
      @outPorts.out.connect()

    @inPorts.in.on 'begingroup', (group) =>
      @groups.push group

    @inPorts.in.on 'data', (data) =>
      @data.push
        data: data
        groups: @groups.slice 0
      do @refresh

    @inPorts.in.on 'endgroup', =>
      @groups.pop()

    @inPorts.in.on 'disconnect', =>
      do @refresh

  refresh: ->
    clearTimeout @timeout if @timeout
    @timeout = setTimeout =>
      do @send
    , @milliseconds

  send: ->
    @sendData data for data in @data
    @outPorts.out.disconnect()

  sendData: (data) ->
    for group in data.groups
      @outPorts.out.beginGroup group
    @outPorts.out.send data.data
    for group in data.groups
      @outPorts.out.endGroup()
      
exports.getComponent = -> new CollectUntilIdle
