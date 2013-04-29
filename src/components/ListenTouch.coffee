if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class ListenTouch extends noflo.Component
  description: 'Listen to touch events on a DOM element'
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
    element.addEventListener 'touchstart', @touchstart, false
    element.addEventListener 'touchmove', @touchmove, false
    element.addEventListener 'touchend', @touchend, false

  touchstart: (event) =>
    event.preventDefault()
    event.stopPropagation()

    return unless event.changedTouches
    return unless event.changedTouches.length

    for touch, idx in event.changedTouches
      @outPorts.start.beginGroup idx
      @outPorts.start.send event
      @outPorts.start.endGroup()

    @outPorts.start.disconnect()

  touchmove: (event) =>
    event.preventDefault()
    event.stopPropagation()

    return unless event.changedTouches
    return unless event.changedTouches.length

    for touch, idx in event.changedTouches
      @outPorts.moveX.beginGroup idx
      @outPorts.moveX.send touch.pageX
      @outPorts.moveX.endGroup()
      @outPorts.moveY.beginGroup idx
      @outPorts.moveY.send touch.pageY
      @outPorts.moveY.endGroup()

  touchend: (event) =>
    event.preventDefault()
    event.stopPropagation()

    return unless event.changedTouches
    return unless event.changedTouches.length

    @outPorts.moveX.disconnect() if @outPorts.moveX.isConnected()
    @outPorts.moveY.disconnect() if @outPorts.moveY.isConnected()

    for touch, idx in event.changedTouches
      @outPorts.end.beginGroup idx
      @outPorts.end.send event
      @outPorts.end.endGroup()

    @outPorts.end.disconnect()

exports.getComponent = -> new ListenTouch
