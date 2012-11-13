component = require "../src/components/SplitStr"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = component.getComponent()
    ins = socket.createSocket()
    delim = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.inPorts.delimiter.attach delim
    c.outPorts.out.attach out
    return [c, ins, delim, out]

exports["test split with default delimiter"] = (test) ->
    [c, ins, delim, out] = setupComponent()
    out.once "data", (data) ->
        test.equal data, "abc"
        out.once "data", (data) ->
            test.equal data, "123"
            test.done()
    ins.send "abc\n123"
    ins.disconnect()

exports["test split with string delimiter"] = (test) ->
    [c, ins, delim, out] = setupComponent()
    out.once "data", (data) ->
        test.equal data, "abc"
        out.once "data", (data) ->
            test.equal data, "123"
            test.done()

    delim.send ','
    delim.disconnect()

    ins.send "abc,123"
    ins.disconnect()

exports["test split with RegExp delimiter"] = (test) ->
    [c, ins, delim, out] = setupComponent()
    out.once "data", (data) ->
        test.equal data, "abc"
        out.once "data", (data) ->
            test.equal data, "123"
            test.done()

    delim.send "/[\n]*[-]{3}[\n]/"
    delim.disconnect()

    ins.send "abc\n---\n123"
    ins.disconnect()
