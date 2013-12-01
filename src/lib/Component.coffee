#     NoFlo - Flow-Based Programming for JavaScript
#     (c) 2013 The Grid
#     (c) 2011-2012 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Baseclass for regular NoFlo components.
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class Component extends EventEmitter
  description: ''
  icon: null

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

  setIcon: (@icon) ->
    @emit 'icon', @icon
  getIcon: -> @icon

  error: (e) =>
    if @outPorts.error and @outPorts.error.isAttached()
      @outPorts.error.send e
      @outPorts.error.disconnect()
      return
    throw e

  shutdown: ->

exports.Component = Component
