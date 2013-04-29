if typeof process is 'object' and process.title is 'node'
  noflo = require "../../lib/NoFlo"
else
  noflo = require '../lib/NoFlo'

class ListenMouse extends noflo.Component
  description: 'Listen to mouse events on a DOM element'
  constructor: ->
    @inPorts =
      element: new noflo.Port 'object'
    @outPorts =
      click: new noflo.ArrayPort 'object'

    @inPorts.element.on 'data', (element) =>
      @subscribe element

  subscribe: (element) ->
    element.addEventListener 'click', @click, false

  click: (event) =>
    event.preventDefault()
    event.stopPropagation()

    @outPorts.click.send event
    @outPorts.click.disconnect()

exports.getComponent = -> new ListenMouse
