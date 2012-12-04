noflo = require "../../lib/NoFlo"
util = require "util"

class Output extends noflo.Component

  description: "This component receives input on a single inport, and
    sends the data items directly to console.log"

  constructor: ->
    @options =
      showHidden: false
      depth: 2
      colors: false

    @inPorts =
      in: new noflo.ArrayPort
      options: new noflo.Port

    @outPorts =
      out: new noflo.Port

    @inPorts.in.on "data", (data) =>
      @log data
      @outPorts.out.send data if @outPorts.out.isAttached()

    @inPorts.options.on "data", (data) =>
      @setOptions data

  setOptions: (options) ->
    throw new Error "Options is not an object" unless typeof options is "object"
    for own key, value of options
      @options[key] = value

  log: (data) ->
    console.log util.inspect data,
      @options.showHidden, @options.depth, @options.colors

exports.getComponent = ->
  new Output()
