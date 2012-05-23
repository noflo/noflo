readfile = require "../src/components/ReadFile"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = readfile.getComponent()
    src = socket.createSocket()
    out = socket.createSocket()
    err = socket.createSocket()
    c.inPorts.in.attach src
    c.outPorts.out.attach out
    c.outPorts.error.attach err
    return [c, src, out, err]

exports["test error reading file"] = (test) ->
    [c, src, out, err] = setupComponent()
    err.once "data", (err) ->
        test.equal err.errno, 34
        test.equal err.code, 'ENOENT'
        test.equal err.path, 'doesnotexist'
        test.done()
    src.send "doesnotexist"

exports["test reading file"] = (test) ->
    [c, src, out, err] = setupComponent()
    expect = "begingroup"
    err.once "data", (err) ->
        test.fail err.message
        test.done()
    out.once "begingroup", (group) ->
        test.equal "begingroup", expect
        test.equal group, "src/components/ReadFile.coffee"
        expect = "data"
    out.once "data", (data) ->
        test.equal "data", expect
        test.ok data.length > 0
        expect = "endgroup"
    out.once "endgroup", ->
        test.equal "endgroup", expect
        test.done()
    src.send "src/components/ReadFile.coffee"
