component = require "../src/components/Concat"
socket = require "../src/lib/InternalSocket"

setupComponent = (inCount) ->
  c = component.getComponent()

  ins = []
  while inCount
    sock = socket.createSocket()
    ins.push sock
    c.inPorts.in.attach sock
    inCount--

  out = socket.createSocket()
  c.outPorts.out.attach out

  [c, ins, out]

exports['packets sent to two ports should be ordered'] = (test) ->
  [c, ins, out] = setupComponent 2

  test.expect 2
  out.once 'data', (data) ->
    test.equals data, 'hello'
    out.once 'data', (data) ->
      test.equals data, 'world'
      test.done()
    
  ins[0].connect()
  ins[1].send 'world'
  ins[0].send 'hello'

exports['packets sent to three ports should be ordered'] = (test) ->
  [c, ins, out] = setupComponent 3

  test.expect 3
  out.once 'data', (data) ->
    test.equals data, 'foo'
    out.once 'data', (data) ->
      test.equals data, 'bar'
      out.once 'data', (data) ->
        test.equals data, 'baz'
        test.done()
    
  ins[0].connect()
  ins[1].send 'bar'
  ins[2].send 'baz'
  ins[0].send 'foo'

exports['buffers should be cleared by disconnect to avoid deadlock'] = (test) ->
  [c, ins, out] = setupComponent 2

  test.expect 2
  out.once 'data', (data) ->
    test.equals data, 'hello'
    out.once 'data', (data) ->
      test.equals data, 'world'
      test.done()
    
  ins[0].connect()
  ins[1].connect()
  # This packet will be lost because it doesn't have a pair
  # and we disconnect
  ins[1].send 'foo'
  ins[0].disconnect()
  ins[1].disconnect()
  ins[0].connect()
  ins[1].send 'world'
  ins[0].send 'hello'
