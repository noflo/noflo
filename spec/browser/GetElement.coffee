getelement = require 'noflo/components/GetElement.js'
socket = require 'noflo/lib/InternalSocket.js'

describe 'GetElement component', ->
  c = null
  ins = null
  selector = null
  element = null
  error = null
  beforeEach ->
    c = getelement.getComponent()
    ins = socket.createSocket()
    selector = socket.createSocket()
    element = socket.createSocket()
    error = socket.createSocket()
    c.inPorts.in.attach ins
    c.inPorts.selector.attach selector
    c.outPorts.element.attach element

  describe 'with non-matching query', ->
    it 'should throw an error when ERROR port is not attached', ->
      chai.expect(-> selector.send 'Foo').to.throw Error
    it 'should transmit an Error when ERROR port is attached', (done) ->
      error.once 'data', (data) ->
        chai.expect(data).to.be.an.instanceof Error
        done()
      c.outPorts.error.attach error
      selector.send 'Foo'

  describe 'with invalid query', ->
    it 'should throw an error when ERROR port is not attached', ->
      chai.expect(-> ins.send {}).to.throw Error
    it 'should transmit an Error when ERROR port is attached', (done) ->
      error.once 'data', (data) ->
        chai.expect(data).to.be.an.instanceof Error
        done()
      c.outPorts.error.attach error
      ins.send {}

  describe 'with invalid container', ->
    it 'should throw an error when ERROR port is not attached', ->
      chai.expect(-> ins.send {}).to.throw Error
    it 'should transmit an Error when ERROR port is attached', (done) ->
      error.once 'data', (data) ->
        chai.expect(data).to.be.an.instanceof Error
        done()
      c.outPorts.error.attach error
      ins.send {}

  describe 'with matching query without container', ->
    it 'should send the matched element to the ELEMENT port', (done) ->
      query = '#fixtures .getelement'
      el = document.querySelector query
      element.once 'data', (data) ->
        chai.expect(data.tagName).to.exist
        chai.expect(data.tagName).to.equal 'DIV'
        chai.expect(data.innerHTML).to.equal 'Foo'
        chai.expect(data).to.equal el
        done()
      selector.send query

  describe 'with matching query with container', ->
    it 'should send the matched element to the ELEMENT port', (done) ->
      container = document.querySelector '#fixtures'
      el = document.querySelector '#fixtures .getelement'
      element.once 'data', (data) ->
        chai.expect(data.tagName).to.exist
        chai.expect(data.tagName).to.equal 'DIV'
        chai.expect(data.innerHTML).to.equal 'Foo'
        chai.expect(data).to.equal el
        done()
      ins.send container
      selector.send '.getelement'
