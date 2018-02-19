getParams = require 'get-function-params'
{Component} = require './Component'

exports.asComponent = (func, options) ->
  params = getParams func
  c = new Component options
  for p in params
    c.inPorts.add p.param
  c.outPorts.add 'out'
  c.outPorts.add 'error'
  c.process (input, output) ->
    for p in params
      return unless input.hasData p.param
    values = params.map (p) ->
      input.getData p.param
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
