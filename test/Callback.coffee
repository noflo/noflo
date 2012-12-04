callback = require "../src/components/Callback"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = callback.getComponent()
  ins = socket.createSocket()
  cb = socket.createSocket()
  c.inPorts.in.attach ins
  c.inPorts.callback.attach cb
  return [c, ins, cb]

exports["test callback"] = (test) ->
  [c, ins, cb] = setupComponent()

  callback = (data) ->
    test.equal data, 'hello, world'
    test.done()
  cb.send callback

  ins.send 'hello, world'
