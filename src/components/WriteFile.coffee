# The WriteFile component receives a filename on the target port, and data on the
# data port
# contents the specified file to the out port. In case of errors the error
# message will be sent to the error port

fs = require "fs"
noflo = require "noflo"

class WriteFile extends noflo.Component
    data: undefined
    target: ""
    constructor: ->
        @inPorts.target = new noflo.Port()
        @inPorts.in = new noflo.Port()
        @outPorts.error = new noflo.Port()

        @inPorts.target.on "data", (target) =>
            return @writeFile target, @data unless typeof @data is "undefined"
            @target = target

        @inPorts.in.on "data", (data) =>
            return @writeFile @target, data if @target.length
            @data = data

    writeFile: (fileName, data) =>
        throw "No target defined" unless fileName.length
        throw "No data defined" if typeof data is "undefined"
        fs.writeFile fileName, data, "utf-8", (err) =>
            if err
                @outPorts.error.send err
                return @outPorts.error.disconnect()

exports.getComponent = ->
    new WriteFile()
