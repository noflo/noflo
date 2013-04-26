if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
  util = require "util"
else
  noflo = require '/noflo'
  util =
    inspect: (data) -> data

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

    @inPorts.in.on "begingroup", (group) =>
      @log group, "begingroup"
      @outPorts.out.beginGroup group if @outPorts.out.isAttached()

    @inPorts.in.on "data", (data) =>
      @log data, "data"
      @outPorts.out.send data if @outPorts.out.isAttached()

    @inPorts.in.on "endgroup", (group) =>
      @log group, "endgroup"
      @outPorts.out.endGroup() if @outPorts.out.isAttached()

    @inPorts.in.on "disconnect", =>
      @log "", "disconnect"
      @outPorts.out.disconnect() if @outPorts.out.isAttached()

    @inPorts.options.on "data", (data) =>
      @setOptions data

  setOptions: (options) ->
    throw new Error "Options is not an object" unless typeof options is "object"
    for own key, value of options
      @options[key] = value

  log: (data, label = "") ->
    console.log "[#{label.toUpperCase()}] " + util.inspect data,
      @options.showHidden, @options.depth, @options.colors

exports.getComponent = ->
  new Output()
