component = require '../src/components/SplitInSequence'
socket = require '../src/lib/InternalSocket'

exports['test sending to single outport'] = (test) ->
  c = component.getComponent()
  ins = socket.createSocket()
  c.inPorts.in.attach ins
  out = socket.createSocket()
  c.outPorts.out.attach out

  expects = [5, 1]
  sends = [5, 1]

  out.on 'data', (data) ->
    test.equals data, expects.shift()

  out.on 'disconnect', ->
    test.done()

  ins.send data for data in sends
  ins.disconnect()

exports['test sending to three outports'] = (test) ->
  c = component.getComponent()
  ins = socket.createSocket()
  c.inPorts.in.attach ins

  sends = [1, 2, 3, 4, 5, 6]
  outs = [
    socket: socket.createSocket()
    expects: [1, 4]
  ,
    socket: socket.createSocket()
    expects: [2, 5]
  ,
    socket: socket.createSocket()
    expects: [3, 6]
  ]

  disconnected = 0
  outs.forEach (out) ->
    c.outPorts.out.attach out.socket

    out.socket.on 'data', (data) ->
      test.ok out.expects.length
      test.equals data, out.expects.shift()
    out.socket.on 'disconnect', ->
      disconnected++
      test.done() if disconnected is outs.length

  ins.send send for send in sends
  ins.disconnect()
