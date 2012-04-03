scrape = require "../src/components/ScrapeHtml"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = scrape.getComponent()
    ins = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.outPorts.out.attach out
    return [c, ins, out]

exports["test selector then html"] = (test) ->
    [c, ins, out] = setupComponent()
    s = socket.createSocket()
    c.inPorts.textSelector.attach s
    expect = ["bar","baz"]
    out.once "begingroup", (group) ->
        test.fail "should not get groups without element ids"
    out.on "data", (data) ->
        test.equal data, expect.shift()
        test.done() if expect.length == 0
    s.send "p.test"
    s.disconnect()
    ins.send '<div><p>foo</p><p class="test">ba'
    ins.send 'r</p><p class="test">baz</p></div>'
    ins.disconnect()

exports["test html then selector"] = (test) ->
    [c, ins, out] = setupComponent()
    s = socket.createSocket()
    c.inPorts.textSelector.attach s
    expect = ["bar","baz"]
    out.on "data", (data) ->
        test.equal data, expect.shift()
        test.done() if expect.length == 0
    ins.send '<div><p>foo</p><p class="test">ba'
    ins.send 'r</p><p class="test">baz</p></div>'
    ins.disconnect()
    s.send "p.test"
    s.disconnect()

exports["test ignore"] = (test) ->
    [c, ins, out] = setupComponent()
    s = socket.createSocket()
    i = socket.createSocket()
    c.inPorts.textSelector.attach s
    c.inPorts.ignoreSelector.attach i
    expect = ["foo"]
    out.on "data", (data) ->
        test.equal data, expect.shift()
        test.done() if expect.length == 0
    i.send ".noise"
    i.send "#crap"
    i.disconnect()
    ins.send '<div><p class="test">foo</p><p id="crap" class="test">ba'
    ins.send 'r</p><p class="test noise">baz</p></div>'
    ins.disconnect()
    s.send "p.test"
    s.disconnect()

exports["test group by element id"] = (test) ->
    [c, ins, out] = setupComponent()
    s = socket.createSocket()
    c.inPorts.textSelector.attach s
    expectevent = "begingroup"
    expectgroup = ["a","b"]
    out.on "begingroup", (group) ->
        test.equal "begingroup", expectevent
        test.equal group, expectgroup.shift()
        expectevent = "data"
    expectdata = ["bar","baz"]
    out.on "data", (data) ->
        test.equal "data", expectevent
        test.equal data, expectdata.shift()
        expectevent = "endgroup"
    out.on "endgroup", ->
        test.equal "endgroup", expectevent
        expectevent = "begingroup"
        test.done() if expectgroup.length == 0
    s.send "p.test"
    s.disconnect()
    ins.send '<div><p>foo</p><p id="a" class="test">ba'
    ins.send 'r</p><p id="b" class="test">baz</p></div>'
    ins.disconnect()
