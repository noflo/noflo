if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  callback = require '../src/components/Callback.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  callback = require 'noflo/src/components/Callback.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Callback component', ->
  c = null
  ins = null
  cb = null
  err = null
  beforeEach ->
    c = callback.getComponent()
    ins = socket.createSocket()
    cb = socket.createSocket()
    err = socket.createSocket()
    c.inPorts.in.attach ins
    c.inPorts.callback.attach cb

  describe 'with invalid callback', ->
    it 'should throw an error when ERROR port is not attached', ->
      chai.expect(-> cb.send 'Foo').to.throw Error
    it 'should transmit an Error when ERROR port is attached', (done) ->
      err.once 'data', (data) ->
        chai.expect(data).to.be.an.instanceof Error
        done()
      c.outPorts.error.attach err
      cb.send 'Foo'

  describe 'with valid callback', ->
    it 'should call the callback with the given data', (done) ->
      cb.send (data) ->
        chai.expect(data).to.equal 'Foo'
        done()
      ins.send 'Foo'
