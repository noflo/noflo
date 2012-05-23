{Port} = require "../src/lib/Port"
{AsyncComponent} = require "../src/lib/AsyncComponent"
socket = require "../src/lib/InternalSocket"

exports["callto super without ports should throw error"] = (test) ->
    class C1 extends AsyncComponent
    test.throws (-> new C1), "no inPort named 'in'"
    class C2 extends AsyncComponent
        constructor: ->
            @inPorts = {in: new Port()}
            super()
    test.throws (-> new C2), "no outPort named 'out'"
    test.done()

exports["unimplemented doSync should throw error"] = (test) ->
    class Unimplemented extends AsyncComponent
        constructor: ->
            @inPorts =
                in: new Port()
            @outPorts =
                out: new Port()
                error: new Port()
            super()
    u = new Unimplemented
    ins = socket.createSocket()
    out = socket.createSocket()
    lod = socket.createSocket()
    err = socket.createSocket()
    u.inPorts.in.attach ins
    u.outPorts.out.attach out
    u.outPorts.load.attach lod
    u.outPorts.error.attach err
    err.on "data", (data) ->
        test.equal data.message, "AsyncComponents must implement doAsync"
        test.done()
    ins.send "foo"

setupComponent = ->
    class Timer extends AsyncComponent
        constructor: ->
            @inPorts =
                in: new Port()
            @outPorts =
                out: new Port()
                error: new Port()
            super()
        doAsync: (data, callback) ->
            setTimeout (=>
                @outPorts.out.send "waited #{data}"
                callback()
            ), data
    t = new Timer
    ins = socket.createSocket()
    out = socket.createSocket()
    lod = socket.createSocket()
    err = socket.createSocket()
    t.inPorts.in.attach ins
    t.outPorts.out.attach out
    t.outPorts.load.attach lod
    t.outPorts.error.attach err
    return [t, ins, out, lod, err]

exports["test async data handling without groups"] = (test) ->
    [t, ins, out, lod, err] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push "out #{data}"
    lod.on "data", (data) ->
        output.push "load #{data}"
        if data == 0
            test.same output, [
                "load 1",
                "load 2",
                "load 3",
                "out waited 100",
                "load 2",
                "out waited 200",
                "load 1",
                "out waited 300",
                "load 0"
            ]
            test.done()
    err.on "data", (data) ->
        test.fail data
        test.done()
    ins.send 300
    ins.send 200
    ins.send 100

exports["test async data handling with groups"] = (test) ->
    [t, ins, out, lod, err] = setupComponent()
    output = []
    groups = 0
    out.on "begingroup", (group) ->
        output.push "group #{group}"
    out.on "data", (data) ->
        output.push "out #{data}"
    out.on "endgroup", ->
        output.push "endgroup"
        groups++
        if groups == 2
            test.same output, [
                "group g1",
                "load 1",
                "load 2",
                "out waited 200",
                "load 1",
                "out waited 500",
                "load 0",
                "endgroup",
                "group g2",
                "load 1",
                "load 2",
                "load 3",
                "out waited 100",
                "load 2",
                "out waited 150",
                "load 1",
                "out waited 400",
                "load 0",
                "endgroup"
            ]
            test.done()
    lod.on "data", (data) ->
        output.push "load #{data}"
    err.on "data", (data) ->
        test.fail data
        test.done()
    ins.beginGroup "g1"
    ins.send 200
    ins.send 500
    ins.endGroup()
    ins.beginGroup "g2"
    ins.send 100
    ins.send 400
    ins.send 150
    ins.endGroup()

exports["test async data handling with nested groups"] = (test) ->
    [t, ins, out, lod, err] = setupComponent()
    output = []
    groups = 0
    out.on "begingroup", (group) ->
        output.push "group #{group}"
    out.on "data", (data) ->
        output.push "out #{data}"
    out.on "endgroup", ->
        output.push "endgroup"
        groups++
    lod.on "data", (load) ->
        output.push "load #{load}"
        if load == 0 and groups == 3
            test.same output, [
                "load 1",
                "out waited 500",
                "load 0",
                "group g1",
                "load 1",
                "out waited 400",
                "load 0",
                "group g1a",
                "load 1",
                "out waited 300",
                "load 0",
                "endgroup",
                "group g1b",
                "load 1",
                "out waited 200",
                "load 0",
                "endgroup",
                "load 1",
                "out waited 100",
                "load 0",
                "endgroup",
                "load 1",
                "out waited 50",
                "load 0"
            ]
            test.done()
    err.on "data", (data) ->
        test.fail data
        test.done()
    ins.send 500
    ins.beginGroup "g1"
    ins.send 400
    ins.beginGroup "g1a"
    ins.send 300
    ins.endGroup()
    ins.beginGroup "g1b"
    ins.send 200
    ins.endGroup()
    ins.send 100
    ins.endGroup()
    ins.send 50


