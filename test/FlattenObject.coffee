flatten = require "../src/components/FlattenObject"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = flatten.getComponent()
    ins = socket.createSocket()
    map = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.inPorts.map.attach map
    c.outPorts.out.attach out
    return [c, ins, map, out]

tree =
    root:
        branch1: ["leaf1", "leaf2"]
        branch2: ["leaf3", "leaf4"]
        branch3:
            branch4: "leaf5"

exports["test no map"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [
            {value:"leaf1"},
            {value:"leaf2"},
            {value:"leaf3"},
            {value:"leaf4"},
            {value:"leaf5"}
        ]
        test.done()
    ins.send tree
    ins.disconnect()

exports["test map depth 0"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [
            {value:"leaf1",index:0},
            {value:"leaf2",index:1},
            {value:"leaf3",index:0},
            {value:"leaf4",index:1}
            {value:"leaf5",index:"branch4"}
        ]
        test.done()
    map.send {0:"index"}
    map.disconnect()
    ins.send tree
    ins.disconnect()

exports["test map depth 1"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [
            {value:"leaf1",branch:"branch1"},
            {value:"leaf2",branch:"branch1"},
            {value:"leaf3",branch:"branch2"},
            {value:"leaf4",branch:"branch2"}
            {value:"leaf5",branch:"branch3"}
        ]
        test.done()
    map.send {1:"branch"}
    map.disconnect()
    ins.send tree
    ins.disconnect()

exports["test map depth 2"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [
            {value:"leaf1",root:"root"},
            {value:"leaf2",root:"root"},
            {value:"leaf3",root:"root"},
            {value:"leaf4",root:"root"}
            {value:"leaf5",root:"root"}
        ]
        test.done()
    map.send {2:"root"}
    map.disconnect()
    ins.send tree
    ins.disconnect()

exports["test map depth 3"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [
            {value:"leaf1",nothere:undefined},
            {value:"leaf2",nothere:undefined},
            {value:"leaf3",nothere:undefined},
            {value:"leaf4",nothere:undefined}
            {value:"leaf5",nothere:undefined}
        ]
        test.done()
    map.send {3:"nothere"}
    map.disconnect()
    ins.send tree
    ins.disconnect()

exports["test map all"] = (test) ->
    [c, ins, map, out] = setupComponent()
    output = []
    out.on "data", (data) ->
        output.push data
    out.once "disconnect", ->
        test.same output, [
            {value:"leaf1",index:0,branch:"branch1",root:"root"},
            {value:"leaf2",index:1,branch:"branch1",root:"root"},
            {value:"leaf3",index:0,branch:"branch2",root:"root"},
            {value:"leaf4",index:1,branch:"branch2",root:"root"}
            {value:"leaf5",index:"branch4",branch:"branch3",root:"root"}
        ]
        test.done()
    map.send {0:"index",1:"branch",2:"root"}
    map.disconnect()
    ins.send tree
    ins.disconnect()

