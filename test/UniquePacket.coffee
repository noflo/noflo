uniquepacket = require "../src/components/UniquePacket"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = uniquepacket.getComponent()
    ins = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.outPorts.out.attach out
    return [c, ins, out]

exports["test all unique"] = (test) ->
    [c, ins, out] = setupComponent()

    expects = [
      'one'
      'two'
      'three'
    ]

    tried = 0
    out.on "data", (data) ->
        test.equal data, expects[tried]
        tried++
        test.done() if tried is expects.length

    ins.send val for val in expects

exports["test two unique"] = (test) ->
    [c, ins, out] = setupComponent()

    trys = [
      'one'
      'one'
      'two'
    ]
    expects = [
      'one'
      'two'
    ]

    out.on "data", (data) ->
        test.equal data, expects.shift()
        test.done() if expects.length is 0

    ins.send val for val in trys
