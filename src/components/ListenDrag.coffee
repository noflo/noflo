if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class ListenDrag extends noflo.Component
  description: 'Listen to drag events on a DOM element'
  constructor: ->
    @inPorts =
      element: new noflo.Port 'object'
    @outPorts =
      start: new noflo.ArrayPort 'object'
      moveX: new noflo.ArrayPort 'number'
      moveY: new noflo.ArrayPort 'number'
      end: new noflo.ArrayPort 'object'

    @inPorts.element.on 'data', (element) =>
      @subscribe element

  subscribe: (element) ->
    element.addEventListener 'dragstart', @dragstart, false
    element.addEventListener 'drag', @dragmove, false
    element.addEventListener 'dragend', @dragend, false

  dragstart: (event) =>
    event.preventDefault()
    event.stopPropagation()

    @outPorts.start.send event
    @outPorts.start.disconnect()

  dragmove: (event) =>
    event.preventDefault()
    event.stopPropagation()
    @outPorts.moveX.send event.clientX
    @outPorts.moveY.send event.clientY

  dragend: (event) =>
    event.preventDefault()
    event.stopPropagation()

    @outPorts.moveX.disconnect() if @outPorts.moveX.isConnected()
    @outPorts.moveY.disconnect() if @outPorts.moveY.isConnected()

    @outPorts.end.send event
    @outPorts.end.disconnect()

exports.getComponent = -> new ListenDrag
