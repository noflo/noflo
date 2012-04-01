# The ReadFile component receives a filename on the soure port, and
# sends the contents of the specified file to the out port. The filename
# is used to create a named group around the file contents data. In case
# of errors the error message will be sent to the error port.

fs = require "fs"
noflo = require "noflo"

class ReadFile extends noflo.Component
    constructor: ->
        @inPorts =
            source: new noflo.Port()
        @outPorts =
            out: new noflo.Port()
            error: new noflo.Port()

        @inPorts.source.on "data", (data) =>
            @readFile data

    readFile: (fileName) ->
        fs.readFile fileName, "utf-8", (err, data) =>
            if err
                @outPorts.error.send err
                return @outPorts.error.disconnect()
            @outPorts.out.beginGroup fileName
            @outPorts.out.send data
            @outPorts.out.endGroup()
            @outPorts.out.disconnect()

exports.getComponent = ->
    new ReadFile()
