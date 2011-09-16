noflo = require "noflo"
fs = require "fs"

class WriteFileRaw extends noflo.Component
    constructor: ->
        @filename = null
        @data = null

        @inPorts =
            in: new noflo.Port
            filename: new noflo.Port
        @outPorts =
            filename: new noflo.Port
            error: new noflo.Port

        @inPorts.in.on "data", (data) =>
            @data = data
            do @writeFile if @filename

        @inPorts.filename.on "data", (data) =>
            @filename = data
            do @writeFile if @data

    writeFile: ->
        fs.open @filename, 'w', (err, fd) =>
            return @outPorts.error.send err if err

            fs.write fd, @data, 0, @data.length, 0, (err, bytes, buffer) =>
                return @outPorts.error.send err if err
                @outPorts.filename.send @filename
                @outPorts.filename.disconnect()

exports.getComponent = -> new WriteFileRaw
