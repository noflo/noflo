mapper = require "../src/components/MapProperty"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = mapper.getComponent()
    ins = socket.createSocket()
    map = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.inPorts.map.attach map
    c.outPorts.out.attach out
    return [c, ins, map, out]

o = { a:1, b:2, c:3 }

exports["test no map"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [{ a:1, b:2, c:3 }]
        test.done()
    ins.send o
    ins.disconnect()

exports["test map to letter key"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [{ d:1, b:2, c:3 }]
        test.done()
    map.send {a:"d"}
    map.disconnect
    ins.send o
    ins.disconnect()

exports["test map to colliding key"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [{ b:[1,2], c:3 }]
        test.done()
    map.send {a:"b"}
    map.disconnect
    ins.send o
    ins.disconnect()

exports["test map to 0 key"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [{ 0:1, b:2, c:3 }]
        test.done()
    map.send {a:0}
    map.disconnect
    ins.send o
    ins.disconnect()

exports["test map to null key"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [{ null:1, b:2, c:3 }]
        test.done()
    map.send {a:null}
    map.disconnect
    ins.send o
    ins.disconnect()

exports["test map to undefined key"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [{ undefined:1, b:2, c:3 }]
        test.done()
    map.send {a:undefined}
    map.disconnect
    ins.send o
    ins.disconnect()

exports["test map to false key"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [{ false:1, b:2, c:3 }]
        test.done()
    map.send {a:false}
    map.disconnect
    ins.send o
    ins.disconnect()


