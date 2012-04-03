fs = require "fs"
readdir = require "../src/components/ReadDir"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = readdir.getComponent()
    src = socket.createSocket()
    out = socket.createSocket()
    err = socket.createSocket()
    c.inPorts.source.attach src
    c.outPorts.out.attach out
    c.outPorts.error.attach err
    return [c, src, out, err]

exports["test error reading dir"] = (test) ->
    [c, src, out, err] = setupComponent()
    err.once "data", (err) ->
        test.equal err.errno, 34
        test.equal err.code, 'ENOENT'
        test.equal err.path, 'doesnotexist'
        test.done()
    src.send "doesnotexist"

module.exports =
    setUp: (callback) ->
        fs.mkdir "test/testdir", ->
            fs.writeFile "test/testdir/a", "a", ->
                fs.writeFile "test/testdir/b", "b", callback
    tearDown: (callback) ->
        fs.unlink "test/testdir/b", ->
            fs.unlink "test/testdir/a", ->
                fs.rmdir "test/testdir", callback
    "test reading dir": (test) ->
        [c, src, out, err] = setupComponent()
        expect = ["test/testdir/a","test/testdir/b"]
        out.on "data", (data) ->
            test.equal data, expect.shift()
            test.done() if expect.length == 0
        src.send "test/testdir"
    "test reading dir with slash": (test) ->
        [c, src, out, err] = setupComponent()
        expect = ["test/testdir/a","test/testdir/b"]
        out.on "data", (data) ->
            test.equal data, expect.shift()
            test.done() if expect.length == 0
        src.send "test/testdir/"
