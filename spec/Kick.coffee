if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  kick = require '../src/components/Kick.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  kick = require 'noflo/src/components/Kick.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Kick component', ->
  c = null
  ins = null
  data = null
  out = null
  beforeEach ->
    c = kick.getComponent()
    ins = socket.createSocket()
    data = socket.createSocket()
    out = socket.createSocket()
    c.inPorts.in.attach ins
    c.inPorts.data.attach data
    c.outPorts.out.attach out

  it 'should not send packets before disconnect', (done) ->
    sent = false
    out.once 'data', (d) ->
      sent = true
    setTimeout ->
      chai.expect(sent).to.be.false
      done()
    , 5
    data.send 'Bar'
    ins.send 'Foo'

  it 'should send a null on disconnect when no data has been specified', (done) ->
    out.once 'data', (d) ->
      chai.expect(d).to.be.null
      done()
    ins.send 'Foo'
    ins.disconnect()

  it 'should send correct data on disconnect', (done) ->
    out.once 'data', (d) ->
      chai.expect(d).to.equal 'Baz'
      done()
    data.send 'Bar'
    data.send 'Baz'
    ins.send 'Foo'
    ins.disconnect()
