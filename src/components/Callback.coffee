# This component calls a given callback function for each IP it receives.
# The Callback component is typically used to connect NoFlo with external
# Node.js code.

if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'
{_} = require 'underscore'

class Callback extends noflo.Component
  description: 'Call a given function with each IP received'
  constructor: ->
    @callback = null

    # We have two input ports. One for the callback to call, and one
    # for IPs to call it with
    @inPorts =
      in: new noflo.Port 'all'
      callback: new noflo.Port 'function'
    # The optional error port is used in case of wrong setups
    @outPorts =
      error: new noflo.Port 'object'

    # Set callback
    @inPorts.callback.on 'data', (data) =>
      unless _.isFunction data
        @error 'The provided callback must be a function'
        return
      @callback = data

    # Call the callback when receiving data
    @inPorts.in.on "data", (data) =>
      unless @callback
        @error 'No callback provided'
        return
      @callback data

  error: (msg) ->
    if @outPorts.error.isAttached()
      @outPorts.error.send new Error msg
      @outPorts.error.disconnect()
      return
    throw new Error msg

exports.getComponent = -> new Callback
