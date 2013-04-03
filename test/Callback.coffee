callback = require "../src/components/Callback"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = callback.getComponent()
  ins = socket.createSocket()
  cb = socket.createSocket()
  err = socket.createSocket()
  c.inPorts.in.attach ins
  c.inPorts.callback.attach cb
  c.outPorts.error.attach err
  return [c, ins, cb, err]

exports['test without callback'] = (test) ->
  [c, ins, cb, err] = setupComponent()

  err.on 'data', (data) ->
    test.ok data
    test.done()

  ins.send 'Foo bar'

exports['test wrong callback'] = (test) ->
  [c, ins, cb, err] = setupComponent()

  err.on 'data', (data) ->
    test.ok data
    test.done()

  cb.send 'Foo bar'

exports["test callback"] = (test) ->
  [c, ins, cb] = setupComponent()

  callback = (data) ->
    test.equal data, 'hello, world'
    test.done()
  cb.send callback

  ins.send 'hello, world'
