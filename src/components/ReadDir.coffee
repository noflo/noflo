# The ReadDir component receives a directory path on the source port, and
# sends the paths of all the files in the directory to the out port. In case
# of errors the error message will be sent to the error port.

fs = require "fs"
noflo = require "noflo"

class ReadDir extends noflo.Component
    constructor: ->
        @inPorts =
            source: new noflo.Port()
        @outPorts =
            out: new noflo.Port()
            error: new noflo.Port()

        @inPorts.source.on "data", (data) =>
            @readdir data

    readdir: (path) ->
        fs.readdir path, (err, files) =>
            if err
                @outPorts.error.send err
                return @outPorts.error.disconnect()
            @outPorts.out.send "#{path}/#{f}" for f in files

exports.getComponent = -> new ReadDir()
