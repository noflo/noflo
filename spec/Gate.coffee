if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  gate = require '../src/components/Gate.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  gate = require 'noflo/src/components/Gate.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Gate component', ->
  c = null
  ins = null
  open = null
  close = null
  out = null
  beforeEach ->
    c = gate.getComponent()
    ins = socket.createSocket()
    open = socket.createSocket()
    close = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.inPorts.open.attach open
    c.inPorts.close.attach close
    c.outPorts.out.attach out

  it 'should be initially closed', ->
    chai.expect(c.open).to.be.false
  it 'should not transmit packets before opening', (done) ->
    received = false
    out.once 'data', (data) ->
      received = true
    ins.send 'Foo'
    setTimeout ->
      chai.expect(received).to.be.false
      done()
    , 1
  it 'should open when receiving packets to the OPEN port', (done) ->
    open.send 'Foo'
    setTimeout ->
      chai.expect(c.open).to.be.true
      done()
    , 1
  it 'should transmit packets after opening', (done) ->
    received = false
    out.once 'data', (data) ->
      chai.expect(data).to.equal 'Foo'
      received = true
    open.send true
    ins.send 'Foo'
    setTimeout ->
      chai.expect(received).to.be.true
      done()
    , 1
  it 'should close when receiving packets to the CLOSE port', (done) ->
    c.open = true
    close.send 'Bar'
    setTimeout ->
      chai.expect(c.open).to.be.false
      done()
    , 1
  it 'should not transmit packets after closing', (done) ->
    c.open = true
    received = false
    out.once 'data', (data) ->
      received = true
    close.send true
    ins.send 'Foo'
    setTimeout ->
      chai.expect(received).to.be.false
      done()
    , 1
