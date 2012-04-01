stat = require "../src/components/Stat"
socket = require "../src/lib/InternalSocket"

setupComponent = ->
    c = stat.getComponent()
    ins = socket.createSocket()
    out = socket.createSocket()
    err = socket.createSocket()
    c.inPorts.in.attach ins
    c.outPorts.out.attach out
    c.outPorts.error.attach err
    return [c, ins, out, err]

exports["test stat nonexistent path"] = (test) ->
    [c, ins, out, err] = setupComponent()
    err.once "data", (err) ->
        test.equal err.errno, 34
        test.equal err.code, 'ENOENT'
        test.equal err.path, 'doesnotexist'
        test.done()
    ins.send "doesnotexist"

exports["test stat file"] = (test) ->
    [c, ins, out, err] = setupComponent()
    err.once "data", (err) ->
        test.fail err
        test.done()
    out.once "data", (stats) ->
        test.equal stats.path, "test/Stat.coffee"
        test.equal stats.isFile, true
        test.ok "uid" of stats
        test.ok "mode" of stats
        test.ok "ctime" of stats
        test.done()
    ins.send "test/Stat.coffee"

exports["test stat dir"] = (test) ->
    [c, ins, out, err] = setupComponent()
    err.once "data", (err) ->
        test.fail err
        test.done()
    out.once "data", (stats) ->
        test.equal stats.path, "test"
        test.equal stats.isDirectory, true
        test.ok "uid" of stats
        test.ok "mode" of stats
        test.ok "ctime" of stats
        test.done()
    ins.send "test"