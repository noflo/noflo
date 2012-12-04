noflo = require "../../lib/NoFlo"
{spawn} = require "child_process"

class ReadDocument extends noflo.Component
  constructor: ->
    @tika = "#{__dirname}/tika-app.jar"

    @inPorts =
      source: new noflo.Port()
      tika: new noflo.Port()
    @outPorts =
      out: new noflo.Port()
      error: new noflo.Port()

    @inPorts.source.on "data", (data) =>
      @readFile data
    @inPorts.tika.on "data", (data) =>
      @tika = data

  readFile: (fileName) ->
    tika = spawn "java", [
      "-jar",
      @tika,
      "-x",
      fileName
    ]
    error = ""
    tika.stdout.setEncoding "utf-8"
    tika.stdout.on "data", (data) =>
      @outPorts.out.send data
    tika.stderr.on "data", (data) ->
      error += data
    tika.on "exit", (code) =>
      if code > 0
        @outPorts.error.send error
        return @outPorts.error.disconnect()
      @outPorts.out.disconnect()

exports.getComponent = ->
  new ReadDocument
