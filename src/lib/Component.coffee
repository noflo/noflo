#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013-2014 TheGrid (Rituwall Inc.)
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Baseclass for regular NoFlo components.
{EventEmitter} = require 'events'

ports = require './Ports'

class Component extends EventEmitter
  description: ''
  icon: null
  started: false

  constructor: (options) ->
    options = {} unless options
    options.inPorts = {} unless options.inPorts
    if options.inPorts instanceof ports.InPorts
      @inPorts = options.inPorts
    else
      @inPorts = new ports.InPorts options.inPorts

    options.outPorts = {} unless options.outPorts
    if options.outPorts instanceof ports.OutPorts
      @outPorts = options.outPorts
    else
      @outPorts = new ports.OutPorts options.outPorts

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

  setIcon: (@icon) ->
    @emit 'icon', @icon
  getIcon: -> @icon

  error: (e, groups = [], errorPort = 'error') =>
    if @outPorts[errorPort] and (@outPorts[errorPort].isAttached() or not @outPorts[errorPort].isRequired())
      @outPorts[errorPort].beginGroup group for group in groups
      @outPorts[errorPort].send e
      @outPorts[errorPort].endGroup() for group in groups
      @outPorts[errorPort].disconnect()
      return
    throw e

  shutdown: ->
    @started = false

  # The startup function performs initialization for the component.
  start: ->
    @started = true
    @started

  isStarted: -> @started

exports.Component = Component
