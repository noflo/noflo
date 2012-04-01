# The Stat component receives a path on the source port, and
# sends a stats object describing that path to the out port. In case
# of errors the error message will be sent to the error port.

fs = require "fs"
noflo = require "noflo"

class Stat extends noflo.Component
    constructor: ->
        @inPorts.in = new noflo.Port()
        @outPorts.out = new noflo.Port()
        @outPorts.error = new noflo.Port()
        @inPorts.in.on "data", (data) =>
            @stat data

    stat: (path) ->
        fs.stat path, (err, stats) =>
            if err
                @outPorts.error.send err
                return @outPorts.error.disconnect()
            stats.path = path
            for func in ["isFile","isDirectory","isBlockDevice",
                "isCharacterDevice", "isFIFO", "isSocket"]
                stats[func] = stats[func]()
            @outPorts.out.send stats

exports.getComponent = -> new Stat()
