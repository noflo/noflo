#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 The Grid
#     NoFlo may be freely distributed under the MIT license
#
# Ports collection classes for NoFlo components
unless require('./Platform').isBrowser()
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

InPort = require './InPort'
OutPort = require './OutPort'

class Ports extends EventEmitter
  ports: {}
  model: InPort
  constructor: (ports) ->
    return unless ports
    for name, options of ports
      @add name, options

  add: (name, options, process) ->
    # Remove previous implementation
    @remove name if @ports[name]

    if options instanceof @model
      @ports[name] = options
    else
      @ports[name] = new @model options, process

    @emit 'add', name

  remove: (name) ->
    throw new Error "Port #{name} not defined" unless @ports[name]
    delete @ports[name]
    @emit 'remove', name

exports.InPorts = class InPorts extends Ports

exports.OutPorts = class OutPorts extends Ports
  model: OutPort
