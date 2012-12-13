fs = require 'fs'
noflo = require "../../lib/NoFlo"

class CopyFile extends noflo.Component
  constructor: ->
    @sourcePath = null
    @destPath = null
    @disconnected = false
    @q = []

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
      return unless @inPorts.destination.isConnected()
      @disconnected = true

    @inPorts.destination.on 'disconnect', =>
      return unless @inPorts.source.isConnected()
      @disconnected = true

  processQueue: ->
    while @q.length
      item = @q.shift()
      @copy item.source, item.destination

  copy: (source, destination) ->
    handleError = (err) =>
      if err.code is 'EMFILE'
        @q.push
          source: source
          destination: destination
        process.nextTick => @processQueue()
        return
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
      @outPorts.out.disconnect() if @disconnected

exports.getComponent = -> new CopyFile
