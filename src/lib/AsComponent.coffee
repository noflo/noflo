#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2018 Flowhub UG
#     NoFlo may be freely distributed under the MIT license
getParams = require 'get-function-params'
{Component} = require './Component'

# ## asComponent generator API
#
# asComponent is a helper for turning JavaScript functions into
# NoFlo components.
#
# Each call to this function returns a component instance where
# the input parameters of the given function are converted into
# NoFlo inports, and there are `out` and `error` ports for the
# results of the function execution.
#
# Variants supported:
#
# * Regular synchronous functions: return value gets sent to `out`. Thrown errors get sent to `error`
# * Functions returning a Promise: resolved promises get sent to `out`, rejected promises to `error`
# * Functions taking a Node.js style asynchronous callback: `err` argument to callback gets sent to `error`, result gets sent to `out`
#
# Usage example:
#
#     exports.getComponent = -> noflo.asComponent Math.random,
#       description: 'Create a random number'
exports.asComponent = (func, options) ->
  hasCallback = false
  params = getParams(func).filter (p) ->
    return true unless p.param is 'callback'
    hasCallback = true
    false

  c = new Component options
  for p in params
    portOptions =
      required: true
    unless typeof p.default is 'undefined'
      portOptions.default = p.default
      portOptions.required = false
    c.inPorts.add p.param, portOptions
    c.forwardBrackets[p.param] = ['out', 'error']
  unless params.length
    c.inPorts.add 'in',
      datatype: 'bang'

  c.outPorts.add 'out'
  c.outPorts.add 'error'
  c.process (input, output) ->
    if params.length
      for p in params
        return unless input.hasData p.param
      values = params.map (p) ->
        input.getData p.param
    else
      return unless input.hasData 'in'
      input.getData 'in'
      values = []

    if hasCallback
      # Handle Node.js style async functions
      values.push (err, res) ->
        return output.done err if err
        output.sendDone res
      res = func.apply null, values
      return

    res = func.apply null, values
    if typeof res is 'object' and typeof res.then is 'function'
      # Result is a Promise, resolve and handle
      res.then (val) ->
        output.sendDone val
      , (err) ->
        output.done err
      return
    output.sendDone res
  c
