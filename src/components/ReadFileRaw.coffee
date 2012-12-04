fs = require "fs"
noflo = require "../../lib/NoFlo"

class ReadFileRaw extends noflo.Component
  constructor: ->
    @inPorts =
      source: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      error: new noflo.Port()

    @inPorts.source.on "data", (data) =>
      @readFile data

  readBuffer: (fd, position, size, buffer) ->
    fs.read fd, buffer, 0, buffer.length, position, (err, bytes, buffer) =>
      @outPorts.out.send buffer.slice 0, bytes
      position += buffer.length
      if position >= size
        return @outPorts.out.disconnect()
      @readBuffer fd, position, size, buffer

  readFile: (filename) ->
    fs.open filename, 'r', (err, fd) =>
      return @outPorts.error.send err if err
      
      fs.fstat fd, (err, stats) =>
        return @outPorts.error.send err if err

        buffer = new Buffer stats.size
        @readBuffer fd, 0, stats.size, buffer

exports.getComponent = -> new ReadFileRaw
