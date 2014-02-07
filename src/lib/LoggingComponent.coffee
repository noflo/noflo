# Baseclass for components that need to write logs.
{ Component } = require "./Component"
{ Port } = require "./Port"
unless require('./Platform').isBrowser()
  util = require "util"
else
  util =
    inspect: (data) -> data

# This class should not be put into a flow. It is intended to be a
# parent class to real components.
# You might use it in your own classes like this:
#
# noflo = require "noflo"
#
# class MyComponent extends noflo.LoggingComponent
#   constructor: ->
#     super
#     @inPorts =
#       in: new noflo.Port()
#     @outPorts.out = new noflo.Port()
#
#     @inPorts.in.on "data", (doc) =>
#       @sendLog
#         LogLevel: "Debug"
#         Message: "Received a message on my IN port saying '#{doc}'."
#
#       @outPorts.out.send doc

class exports.LoggingComponent extends Component
  constructor: ->
    @outPorts =
      log: new Port()

  sendLog: (message) =>
    if typeof message is "object"
      message.when = new Date
      message.source = this.constructor.name
      message.nodeID = @nodeId if @nodeId?

    if @outPorts.log? and @outPorts.log.isAttached()
      @outPorts.log.send message
    else
      console.log util.inspect message, 4, true, true
