lastpacket = require "../src/components/LastPacket"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = lastpacket.getComponent()
    ins = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.outPorts.out.attach out
    return [c, ins, out]

exports["test last"] = (test) ->
    [c, ins, out] = setupComponent()

    trys = [
      'one'
      'two'
      'three'
    ]
    expects = [
      'three'
    ]

    out.on "data", (data) ->
        test.equal data, expects.shift()
        test.done() if expects.length is 0

    ins.send val for val in trys
    ins.disconnect()
