filterpv = require "../src/components/FilterPacket"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = filterpv.getComponent()
    ins = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.outPorts.out.attach out
    return [c, ins, out]

exports["test default behavior"] = (test) ->
    [c, ins, out] = setupComponent()
    actual = 'hello world'
    expect = 'hello world'
    out.on "data", (data) ->
        test.equal data, expect
        test.done()
    ins.send actual

exports["test accept via regexp"] = (test) ->
    [c, ins, out] = setupComponent()
    reg = socket.createSocket()
    c.inPorts.regexp.attach reg
    reg.send "[tg]rue"
    expect = ["grue", true]
    out.on "data", (data) ->
        test.equal data, expect.shift()
        test.done() if expect.length is 0
    ins.send "grue" #accept
    ins.send false  #reject
    ins.send "foo"  #reject
    ins.send true   #accept
