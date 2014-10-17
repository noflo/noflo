#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2014 TheGrid (Rituwall Inc.)
#     NoFlo may be freely distributed under the MIT license
#
# Ports collection classes for NoFlo components
{EventEmitter} = require 'events'

InPort = require './InPort'
OutPort = require './OutPort'

class Ports extends EventEmitter
  model: InPort
  constructor: (ports) ->
    @ports = {}
    return unless ports
    for name, options of ports
      @add name, options

  add: (name, options, process) ->
    if name is 'add' or name is 'remove'
      throw new Error 'Add and remove are restricted port names'

    unless name.match /^[a-z0-9_\.\/]+$/
      throw new Error "Port names can only contain lowercase alphanumeric characters and underscores. '#{name}' not allowed"

    # Remove previous implementation
    @remove name if @ports[name]

    if typeof options is 'object' and options.canAttach
      @ports[name] = options
    else
      @ports[name] = new @model options, process

    @[name] = @ports[name]

    @emit 'add', name

    @ # chainable

  remove: (name) ->
    throw new Error "Port #{name} not defined" unless @ports[name]
    delete @ports[name]
    delete @[name]
    @emit 'remove', name

    @ # chainable

exports.InPorts = class InPorts extends Ports
  on: (name, event, callback) ->
    throw new Error "Port #{name} not available" unless @ports[name]
    @ports[name].on event, callback
  once: (name, event, callback) ->
    throw new Error "Port #{name} not available" unless @ports[name]
    @ports[name].once event, callback

exports.OutPorts = class OutPorts extends Ports
  model: OutPort

  connect: (name, socketId) ->
    throw new Error "Port #{name} not available" unless @ports[name]
    @ports[name].connect socketId
  beginGroup: (name, group, socketId) ->
    throw new Error "Port #{name} not available" unless @ports[name]
    @ports[name].beginGroup group, socketId
  send: (name, data, socketId) ->
    throw new Error "Port #{name} not available" unless @ports[name]
    @ports[name].send data, socketId
  endGroup: (name, socketId) ->
    throw new Error "Port #{name} not available" unless @ports[name]
    @ports[name].endGroup socketId
  disconnect: (name, socketId) ->
    throw new Error "Port #{name} not available" unless @ports[name]
    @ports[name].disconnect socketId
