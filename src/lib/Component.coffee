#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2011 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license
if typeof process is 'object' and process.title is 'node'
  {EventEmitter} = require 'events'
else
  EventEmitter = require 'emitter'

class Component extends EventEmitter
  description: ""

  getDescription: -> @description

  isReady: -> true

  isSubgraph: -> false

exports.Component = Component
