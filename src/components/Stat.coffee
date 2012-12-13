# The Stat component receives a path on the source port, and
# sends a stats object describing that path to the out port. In case
# of errors the error message will be sent to the error port.

fs = require "fs"
noflo = require "../../lib/NoFlo"

class Stat extends noflo.AsyncComponent
  constructor: ->
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      error: new noflo.Port()
    super()

  doAsync: (path, callback) ->
    fs.stat path, (err, stats) =>
      return callback err if err
      callback null
      stats.path = path
      for func in ["isFile","isDirectory","isBlockDevice",
        "isCharacterDevice", "isFIFO", "isSocket"]
        stats[func] = stats[func]()
      @outPorts.out.send stats
      @outPorts.out.disconnect()

exports.getComponent = -> new Stat()
