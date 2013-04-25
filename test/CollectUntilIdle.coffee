collect = require "../src/components/CollectUntilIdle"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
  c = collect.getComponent()
  ins = socket.createSocket()
  time = socket.createSocket()
  out = socket.createSocket()
  c.inPorts.in.attach ins
  c.inPorts.timeout.attach time
  c.outPorts.out.attach out
  return [c, ins, time, out]

exports["test no groups"] = (test) ->
  [c, ins, time, out] = setupComponent()
  output = []
  test.expect 1
  out.on "data", (data) ->
    output.push data
  out.on "disconnect", ->
    test.same output, ["a","b","c"]
    test.done()
  ins.send "a"
  ins.send "b"
  ins.send "c"
  ins.disconnect()
