filterpv = require "../src/components/FilterPropertyValue"
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
    actual = [{a:1},{b:2},{c:3}]
    expect = [{a:1},{b:2},{c:3}]
    out.on "data", (data) ->
        expected = expect.shift()
        test.equal (Object.keys data).length, (Object.keys expected).length
        test.equal val, expected[prop] for prop, val of data
        test.done() if expect.length == 0
    ins.send a for a in actual

exports["test accept via map"] = (test) ->
    [c, ins, out] = setupComponent()
    acc = socket.createSocket()
    c.inPorts.accept.attach acc
    acc.send { good: true }
    out.on "data", (data) ->
        test.equal data.good, true
        test.equal data.bar, 3
        test.equal (k for k of data).length, 2
        test.done()
    ins.send { good: false, foo: 1 } # reject
    ins.send { baz: 2 }              # reject
    ins.send { good: true, bar: 3 }  # accept

exports["test accept via pairs"] = (test) ->
    [c, ins, out] = setupComponent()
    acc = socket.createSocket()
    c.inPorts.accept.attach acc
    acc.send "food=true"
    acc.send "good=yes"
    acc.send "hood=1"
    expect = [["good","yes"],["hood",1],["food",true]]
    out.on "data", (data) ->
        [k,v] = expect.shift()
        test.equal data[k], v
        test.done() if expect.length is 0
    ins.send { good: "yes" }         # accept
    ins.send { hood: 1 }             # accept
    ins.send { good: false, foo: 1 } # reject
    ins.send { baz: 2 }              # reject
    ins.send { food: true, bar: 3 }  # accept

exports["test accept via regexp"] = (test) ->
    [c, ins, out] = setupComponent()
    reg = socket.createSocket()
    c.inPorts.regexp.attach reg
    reg.send "good=[tg]rue"
    expect = ["grue",true]
    out.on "data", (data) ->
        test.equal data.good, expect.shift()
        test.equal data.bar, 3
        test.equal (k for k of data).length, 2
        test.done() if expect.length is 0
    ins.send { good: "grue", bar: 3 } # accept
    ins.send { good: false, foo: 1 }  # reject
    ins.send { baz: 2 }               # reject
    ins.send { good: true, bar: 3 }   # accept



