component = require "../src/components/CompileString"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = component.getComponent()
  ins = socket.createSocket()
  delim = socket.createSocket()
  out = socket.createSocket()
  c.inPorts.in.attach ins
  c.inPorts.delimiter.attach delim
  c.outPorts.out.attach out
  [c, ins, delim, out]

exports['single string should be returned as-is'] = (test) ->
  [c, ins, delim, out] = setupComponent()

  test.expect 1

  out.once 'data', (data) ->
    test.equals data, 'foo'
    test.done()

  ins.send 'foo'
  ins.disconnect()

exports['two strings should be returned together'] = (test) ->
  [c, ins, delim, out] = setupComponent()

  test.expect 1

  out.once 'data', (data) ->
    test.equals data, 'foobar'
    test.done()

  delim.send ''

  ins.send 'foo'
  ins.send 'bar'
  ins.disconnect()

exports['delimiter should be between the strings'] = (test) ->
  [c, ins, delim, out] = setupComponent()

  test.expect 1

  out.once 'data', (data) ->
    test.equals data, 'foo-bar'
    test.done()

  delim.send '-'

  ins.send 'foo'
  ins.send 'bar'
  ins.disconnect()
