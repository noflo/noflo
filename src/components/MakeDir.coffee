fs = require 'fs'
path = require 'path'
noflo = require "../../lib/NoFlo"

class MakeDir extends noflo.AsyncComponent
  constructor: ->
    @inPorts =
      in: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      error: new noflo.Port()

    super()

  sendPath: (dirPath) ->

  doAsync: (dirPath, callback) ->
    @mkDir dirPath, (err) =>
      return callback err if err
      @outPorts.out.send dirPath
      @outPorts.out.disconnect()
      callback null

  mkDir: (dirPath, callback) ->
    orig = dirPath
    dirPath = path.resolve dirPath
    fs.mkdir dirPath, (err) =>
      # Directory was created
      return callback null unless err

      switch err.code
        when 'ENOENT'
          # Parent missing, create
          @mkDir path.dirname(dirPath), (err) =>
            return callback err if err
            @mkDir dirPath, callback

        else
          # Check if the directory actually exists already
          fs.stat dirPath, (statErr, stat) =>
            return callback err if statErr
            return callback err unless stat.isDirectory()
            callback null

exports.getComponent = -> new MakeDir
