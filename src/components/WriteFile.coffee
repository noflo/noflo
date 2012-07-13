fs = require 'fs'
noflo = require 'noflo'

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
      @data = data
      @writeFile @filename, data if @filename

    @inPorts.filename.on 'data', (data) =>
      @filename = data
      @writeFile data, @data if @data

    @inPorts.filename.on 'endgroup', =>
      @filename = null

  writeFile: (filename, data) ->
    fs.writeFile filename, data, 'utf-8', (err) =>
      return @outPorts.error send err if err
      @outPorts.out.send filename
      @outPorts.out.disconnect()

exports.getComponent = -> new WriteFile
