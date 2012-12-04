noflo = require "../../lib/NoFlo"
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
      @writeFile @filename, data if @filename

    @inPorts.filename.on 'endgroup', =>
      @filename = null

    @inPorts.filename.on "data", (data) =>
      @filename = data
      @writeFile data, @data if @data

  writeFile: (filename, data) ->
    fs.open filename, 'w', (err, fd) =>
      return @outPorts.error.send err if err

      fs.write fd, data, 0, data.length, 0, (err, bytes, buffer) =>
        return @outPorts.error.send err if err
        @outPorts.filename.send filename
        @outPorts.filename.disconnect()

exports.getComponent = -> new WriteFileRaw
