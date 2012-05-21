readenv = require "../src/components/ParseYaml"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = readenv.getComponent()
  ins = socket.createSocket()
  out = socket.createSocket()
  c.inPorts.in.attach ins
  c.outPorts.out.attach out
  [c, ins, out]

exports['test reading simple YAML array'] = (test) ->
  test.expect 3
  [c, ins, out] = setupComponent()
  out.once 'data', (data) ->
    test.equal data.length, 3
    test.equal data[0], 'one'
    test.equal data[2], 'three'
    test.done()
  ins.send """- one
- two
- three
"""
