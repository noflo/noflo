if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  port = require '../src/lib/Port.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  port = require 'noflo/lib/Port.js'
  socket = require 'noflo/lib/InternalSocket.js'

describe 'Untyped port instance', ->
  it 'should be of type "all"', ->
    p = new port.Port
    chai.expect(p.type).to.equal 'all'

describe 'Port instance', ->
  p = null
  it 'should retain the given type', ->
    p = new port.Port 'string'
    chai.expect(p.type).to.equal 'string'

  it 'should not be attached initially', ->
    chai.expect(p.isAttached()).to.equal false
  it 'should not be connected initially', ->
    chai.expect(p.isConnected()).to.equal false
  it 'should not contain a socket initially', ->
    chai.expect(p.socket).to.not.exist

  describe 'With attached socket', ->
    s = new socket.InternalSocket
    it 'should emit an event', (done) ->
      p.once 'attach', (sock) ->
        chai.expect(sock).to.equal s
        done()
      p.attach s
    it 'should be marked as attached', ->
      chai.expect(p.isAttached()).to.equal true
    it 'should not be connected initially', ->
      chai.expect(p.isConnected()).to.equal false
    it 'should have a reference to the socket', ->
      chai.expect(p.socket).to.equal s
    it 'should not allow other sockets to be attached', ->
      chai.expect(-> p.attach(new socket.InternalSocket)).to.throw Error

    it 'should emit an event on detaching', (done) ->
      p.once 'detach', (sock) ->
        chai.expect(sock).to.equal s
        done()
      p.detach()
    it 'should not be attached any longer', ->
      chai.expect(p.isAttached()).to.equal false
    it 'should not contain a socket any longer', ->
      chai.expect(p.socket).to.not.exist

describe 'Input port', ->
  p = new port.Port
  s = new socket.InternalSocket
  p.attach s
  it 'should emit connection events', (done) ->
    p.once 'connect', (sock, id) ->
      chai.expect(sock).to.equal s
      chai.expect(id).to.equal null
      done()
    s.connect()
  it 'should be connected after that', ->
    chai.expect(p.isConnected()).to.equal true
  it 'should emit begin group events', (done) ->
    p.once 'begingroup', (group, id) ->
      chai.expect(group).to.equal 'Foo'
      chai.expect(id).to.equal null
      done()
    s.beginGroup 'Foo'
  it 'should emit data events', (done) ->
    p.once 'data', (data, id) ->
      chai.expect(data).to.equal 'Bar'
      chai.expect(id).to.equal null
      done()
    s.send 'Bar'
  it 'should emit end group events', (done) ->
    p.once 'endgroup', (group, id) ->
      chai.expect(group).to.equal 'Foo'
      chai.expect(id).to.equal null
      done()
    s.endGroup()
  it 'should emit disconnection events', (done) ->
    p.once 'disconnect', (sock, id) ->
      chai.expect(sock).to.equal s
      chai.expect(id).to.equal null
      done()
    s.disconnect()
  it 'should not be connected after that', ->
    chai.expect(p.isConnected()).to.equal false
