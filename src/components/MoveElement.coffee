if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class MoveElement extends noflo.Component
  description: 'Change the coordinates of a DOM element'
  constructor: ->
    @element = null
    @inPorts =
      element: new noflo.Port 'object'
      x: new noflo.Port 'number'
      y: new noflo.Port 'number'
      z: new noflo.Port 'number'

    @inPorts.element.on 'data', (element) =>
      @element = element
    @inPorts.x.on 'data', (x) =>
      @setPosition 'left', "#{x}px"
    @inPorts.y.on 'data', (y) =>
      @setPosition 'top', "#{y}px"
    @inPorts.z.on 'data', (z) =>
      @setPosition 'zIndex', z

  setPosition: (attr, value) ->
    @element.style.position = 'absolute'
    @element.style[attr] = value

exports.getComponent = -> new MoveElement
