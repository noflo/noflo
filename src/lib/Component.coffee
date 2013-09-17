#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2011 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
#
# Baseclass for regular NoFlo components.
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class Component extends EventEmitter
  description: ""

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

  shutdown: ->

exports.Component = Component
