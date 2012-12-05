kick = require "../src/components/Kick"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = kick.getComponent()
  ins = socket.createSocket()
  data = socket.createSocket()
  out = socket.createSocket()
  c.inPorts.in.attach ins
  c.inPorts.data.attach data
  c.outPorts.out.attach out
  return [c, ins, data, out]

exports["test that no packets are sent before disconnect"] = (test) ->
  [c, ins, data, out] = setupComponent()

  sent = false
  out.once "data", (data) ->
    sent = true

  ins.send 'foo'
  setTimeout ->
    test.equal sent, false
    test.done()
  , 5

exports["test kick without specified data"] = (test) ->
  [c, ins, data, out] = setupComponent()

  test.expect 1

  out.once "data", (data) ->
    test.equal data, null
    test.done()

  ins.send 'foo'
  ins.disconnect()

exports["test kick with data"] = (test) ->
  [c, ins, data, out] = setupComponent()

  test.expect 2

  out.once "data", (data) ->
    test.ok data.foo
    test.equal data.foo, 'bar'
    test.done()

  data.send
    foo: 'bar'
  ins.send 'foo'
  ins.disconnect()
