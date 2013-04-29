listenMouse = require 'noflo/src/components/ListenMouse.js'
socket = require 'noflo/src/lib/InternalSocket.js'

describe 'ListenMouse component', ->
  c = null
  element = null
  click = null
  beforeEach ->
    c = listenMouse.getComponent()
    element = socket.createSocket()
    click = socket.createSocket()
    c.inPorts.element.attach element
    c.outPorts.click.attach click

  describe 'on matched element', ->
    el = document.querySelector '#fixtures .listenmouse .target'
    it 'should transmit a click event on mouse click', (done) ->
      element.send el
      click.once 'data', (data) ->
        chai.expect(data).is.instanceof UIEvent
        done()
      evt = document.createEvent 'UIEvent'
      evt.initUIEvent 'click', true, true
      evt.clientX = 5
      evt.clientY = 10
      el.dispatchEvent evt
