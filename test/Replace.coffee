replace = require "../src/components/Replace"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = replace.getComponent()
    ins = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.outPorts.out.attach out
    return [c, ins, out]

exports["test no pattern no replacement"] = (test) ->
    [c, ins, out] = setupComponent()
    out.once "data", (data) ->
        test.equal data, "abc123"
        test.done()
    ins.send "abc123"

exports["test no pattern"] = (test) ->
    [c, ins, out] = setupComponent()
    r = socket.createSocket()
    c.inPorts.replacement.attach r
    out.once "data", (data) ->
        test.equal data, "abc123"
        test.done()
    r.send "foo"
    ins.send "abc123"

exports["test simple replacement"] = (test) ->
    [c, ins, out] = setupComponent()
    p = socket.createSocket()
    c.inPorts.pattern.attach p
    r = socket.createSocket()
    c.inPorts.replacement.attach r
    out.once "data", (data) ->
        test.equal data, "xyz123"
        test.done()
    p.send "abc"
    r.send "xyz"
    ins.send "abc123"

exports["test simple replacement with slashes"] = (test) ->
    [c, ins, out] = setupComponent()
    p = socket.createSocket()
    c.inPorts.pattern.attach p
    r = socket.createSocket()
    c.inPorts.replacement.attach r
    out.once "data", (data) ->
        test.equal data, "/abc/xyz/baz"
        test.done()
    p.send "/foo/bar/"
    r.send "/abc/xyz/"
    ins.send "/foo/bar/baz"

exports["test no replacement"] = (test) ->
    [c, ins, out] = setupComponent()
    p = socket.createSocket()
    c.inPorts.pattern.attach p
    out.once "data", (data) ->
        test.equal data, "123"
        test.done()
    p.send "[a-z]"
    ins.send "abc123"

exports["test replacement"] = (test) ->
    [c, ins, out] = setupComponent()
    p = socket.createSocket()
    r = socket.createSocket()
    c.inPorts.pattern.attach p
    c.inPorts.replacement.attach r
    out.once "data", (data) ->
        test.equal data, "xxx123"
        test.done()
    p.send "[a-z]"
    r.send "x"
    ins.send "abc123"

exports["test groups"] = (test) ->
    [c, ins, out] = setupComponent()
    p = socket.createSocket()
    r = socket.createSocket()
    c.inPorts.pattern.attach p
    c.inPorts.replacement.attach r
    expect = "begingroup"
    out.once "begingroup", (group) ->
        test.equal expect, "begingroup"
        test.equal group, "g"
        expect = "data"
    out.once "data", (data) ->
        test.equal expect, "data"
        test.equal data, "xxx123"
        expect = "endgroup"
    out.once "endgroup", ->
        test.equal expect, "endgroup"
        test.done()
    p.send "[a-z]"
    r.send "x"
    ins.beginGroup "g"
    ins.send "abc123"
    ins.endGroup()



