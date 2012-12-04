noflo = require "../../lib/NoFlo"

class Template extends noflo.Component
  description: "This component receives a templating engine name,
    a string containing the template, and variables for the template.
    Then it runs the chosen template engine and sends resulting
    templated content to the output port"

  constructor: ->
    @engine = "jade"
    @variables = null
    @template = null

    @inPorts =
      engine: new noflo.Port()
      options: new noflo.Port()
      template: new noflo.Port()

    @outPorts =
      out: new noflo.Port()

    @inPorts.engine.on "data", (data) =>
      @engine = data

    @inPorts.options.on "connect", =>
      @variables = null
    @inPorts.options.on "data", (data) =>
      @variables = data
    @inPorts.options.on "disconnect", =>
      @outPorts.out.connect() if @template

    @inPorts.template.on "connect", =>
      @template = null
    @inPorts.template.on "data", (data) =>
      @template = data
    @inPorts.template.on "disconnect", =>
      @outPorts.out.connect() if @variables

    @outPorts.out.on "connect", =>
      templating = require @engine
      fn = templating.compile @template, @variables
      @outPorts.out.send fn @variables.locals
      @variables = null
      @outPorts.out.disconnect()

exports.getComponent = ->
  new Template()
