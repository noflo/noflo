component = require "../src/components/Base64Encode"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = component.getComponent()
  ins = socket.createSocket()
  out = socket.createSocket()
  c.inPorts.in.attach ins
  c.outPorts.out.attach out
  return [c, ins, out]

exports['test encoding a string'] = (test) ->
  [c, ins, out] = setupComponent()

  out.on 'data', (data) ->
    test.equals data, 'SGVsbG8sIFdvcmxkIQ=='
    test.done()

  ins.send 'Hello, World!'
  ins.disconnect()

exports['test encoding set of strings'] = (test) ->
  [c, ins, out] = setupComponent()

  out.on 'data', (data) ->
    test.equals data, 'SGVsbG8sIFdvcmxkIQ=='
    test.done()

  ins.send 'Hello, '
  ins.send 'World'
  ins.send '!'
  ins.disconnect()

exports['test encoding a buffer'] = (test) ->
  [c, ins, out] = setupComponent()

  out.on 'data', (data) ->
    test.equals data, 'SGVsbG8sIFdvcmxkIQ=='
    test.done()

  ins.send new Buffer 'Hello, World!'
  ins.disconnect()
