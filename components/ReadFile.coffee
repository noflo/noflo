# The ReadFile component receives a filename on the soure port, and sends
# contents the specified file to the out port. In case of errors the error
# message will be sent to the error port

fs = require "fs"
noflo = require "noflo"

class ReadFile extends noflo.Component
    constructor: ->
        @inPorts.source = new noflo.Port()
        @outPorts.out = new noflo.Port()
        @outPorts.error = new noflo.Port()
        @inPorts.source.on "data", (data) =>
            @readFile data

    readFile: (fileName) ->
        fs.readFile fileName, "utf-8", (err, data) =>
            if err  
                @outPorts.error.send err
                return @outPorts.error.disconnect()
            @outPorts.out.send data
            @outPorts.out.disconnect()

exports.getComponent = ->
    new ReadFile()
