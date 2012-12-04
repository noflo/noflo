fs = require 'fs'
noflo = require "../../lib/NoFlo"

class CopyFile extends noflo.Component
  constructor: ->
    @sourcePath = null
    @destPath = null

    @inPorts =
      source: new noflo.Port()
      destination: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      error: new noflo.Port()

    @inPorts.source.on 'data', (data) =>
      if @destPath
        @copy data, @destPath
        @destPath = null
        return
      @sourcePath = data
    @inPorts.destination.on 'data', (data) =>
      if @sourcePath
        @copy @sourcePath, data
        @sourcePath = null
        return
      @destPath = data

    @inPorts.source.on 'disconnect', =>
      @outPorts.out.disconnect() unless @inPorts.destination.isConnected()

    @inPorts.destination.on 'disconnect', =>
      @outPorts.out.disconnect() unless @inPorts.source.isConnected()

  copy: (source, destination) ->
    handleError = (err) =>
      return unless @outPorts.error.isAttached()
      @outPorts.error.send err
      @outPorts.error.disconnect()

    rs = fs.createReadStream source
    ws = fs.createWriteStream destination
    rs.on 'error', handleError
    ws.on 'error', handleError

    rs.pipe ws
    rs.on 'end', =>
      @outPorts.out.send destination

exports.getComponent = -> new CopyFile
