# The ReadDir component receives a directory path on the source port, and
# sends the paths of all the files in the directory to the out port. In case
# of errors the error message will be sent to the error port.

fs = require "fs"
noflo = require "../../lib/NoFlo"

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
      path = path.slice(0,-1) if path.slice(-1) == "/"
      sortedFiles = files.sort()
      @outPorts.out.send "#{path}/#{f}" for f in sortedFiles
      @outPorts.out.disconnect()

exports.getComponent = -> new ReadDir()
