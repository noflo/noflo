component = require "../src/components/Counter"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = component.getComponent()
  ins = socket.createSocket()
  count = socket.createSocket()
  out = socket.createSocket()
  c.inPorts.in.attach ins
  c.outPorts.count.attach count
  c.outPorts.out.attach out
  [c, ins, count, out]

exports['single packet should return count of 1'] = (test) ->
  [c, ins, count] = setupComponent()

  test.expect 1

  count.once 'data', (data) ->
    test.equals data, 1
    test.done()

  ins.send 'hello'
  ins.disconnect()

exports['single packet should be forwarded'] = (test) ->
  [c, ins, count, out] = setupComponent()

  test.expect 1

  out.once 'data', (data) ->
    test.equals data, 'hello'
    test.done()

  ins.send 'hello'

exports['two packets should return count of 2'] = (test) ->
  [c, ins, count] = setupComponent()

  test.expect 1

  count.once 'data', (data) ->
    test.equals data, 2
    test.done()

  ins.send 'hello'
  ins.send 'world'
  ins.disconnect()

exports['disconnecting and sending later should start new count'] = (test) ->
  [c, ins, count] = setupComponent()

  test.expect 2

  count.once 'data', (data) ->
    test.equals data, 2
  count.once 'disconnect', ->
    count.once 'data', (data) ->
      test.equals data, 1
      test.done()

  ins.send 'hello'
  ins.send 'world'
  ins.disconnect()
  ins.send 'foo'
  ins.disconnect()
