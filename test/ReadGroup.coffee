readenv = require "../src/components/ReadGroup"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = readenv.getComponent()
  ins = socket.createSocket()
  group = socket.createSocket()
  c.inPorts.in.attach ins
  c.outPorts.group.attach group
  [c, ins, group]

exports['test reading a group'] = (test) ->
  test.expect 1
  [c, ins, group] = setupComponent()
  group.once 'data', (data) ->
    test.equal data, 'foo'
    test.done()
  ins.beginGroup 'foo'
  ins.send 'hello'

exports['test reading a subgroup'] = (test) ->
  test.expect 1
  [c, ins, group] = setupComponent()
  group.once 'data', (data) ->
    test.equal data, 'foo:bar'
    test.done()
  ins.beginGroup 'foo'
  ins.beginGroup 'bar'
  ins.send 'hello'
