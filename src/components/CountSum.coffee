noflo = require '../../lib/NoFlo'

class CountSum extends noflo.Component
  constructor: ->
    @portCounts = {}

    @inPorts =
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.ArrayPort

    @inPorts.in.on 'data', (data, portId) =>
      @count portId, data

    @inPorts.in.on 'disconnect', (socket, portId) =>
      #@portCounts[portId] = null
      for socket in @inPorts.in.sockets
        return if socket.isConnected()
      @outPorts.out.disconnect()

  count: (port, data) ->
    sum = 0
    @portCounts[port] = data

    for socket, id in @inPorts.in.sockets
      if typeof @portCounts[id] is 'undefined'
        # Never connected
        @portCounts[id] = 0

      sum += @portCounts[id]

    @outPorts.out.send sum

exports.getComponent = -> new CountSum
