fs = require 'fs'
noflo = require '../../lib/NoFlo'

class WriteFile extends noflo.Component
  constructor: ->
    @data = null
    @filename = null

    @inPorts =
      in: new noflo.Port
      filename: new noflo.Port
    @outPorts =
      out: new noflo.Port
      error: new noflo.Port

    @inPorts.in.on 'data', (data) =>
      if @filename
        @writeFile @filename, data
        @filename = null
        return
      @data = data

    @inPorts.filename.on 'data', (data) =>
      unless @data is null
        @writeFile data, @data
        @data = null
        return
      @filename = data

  writeFile: (filename, data) ->
    fs.writeFile filename, data, 'utf-8', (err) =>
      return @outPorts.error.send err if err
      @outPorts.out.send filename
      @outPorts.out.disconnect()

exports.getComponent = -> new WriteFile
