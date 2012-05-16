readenv = require "../src/components/ReadEnv"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = readenv.getComponent()
  key = socket.createSocket()
  out = socket.createSocket()
  err = socket.createSocket()
  c.inPorts.key.attach key
  c.outPorts.out.attach out
  c.outPorts.error.attach err
  [c, key, out, err]

exports['test reading nonexistent env variable'] = (test) ->
  test.expect 1
  [c, key, out, err] = setupComponent()
  err.once 'data', (err) ->
    test.equal typeof err, 'string'
    test.done()
  key.send 'baz'

exports['test reading existing env variable'] = (test) ->
  process.env.foo = 'bar'
  test.expect 1
  [c, key, out, err] = setupComponent()
  out.once 'data', (data) ->
    test.equal data, 'bar'
    delete process.env.foo
    test.done()
  key.send 'foo'
