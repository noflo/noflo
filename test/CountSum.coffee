component = require '../src/components/CountSum'
socket = require '../src/lib/InternalSocket'

exports['count sum for single connected port'] = (test) ->
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

exports['count sum for two connected ports'] = (test) ->
  c = component.getComponent()
  one = socket.createSocket()
  c.inPorts.in.attach one
  two = socket.createSocket()
  c.inPorts.in.attach two
  out = socket.createSocket()
  c.outPorts.out.attach out

  expects = [1, 3, 5, 7]
  sendsOne = [1, 3]
  sendsTwo = [2, 4]

  out.on 'data', (data) ->
    test.ok expects.length
    test.equals data, expects.shift()

  out.on 'disconnect', ->
    test.done()

  one.send sendsOne.shift()
  two.send sendsTwo.shift()
  one.send sendsOne.shift()
  two.send sendsTwo.shift()
  one.disconnect()
  two.disconnect()
