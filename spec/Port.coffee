if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  port = require '../src/lib/Port.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  port = require 'noflo/src/lib/Port.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Legacy Port', ->

  describe 'Untyped port instance', ->
    it 'should be of type "all"', ->
      p = new port.Port
      chai.expect(p.type).to.equal 'all'
      chai.expect(p.getDataType()).to.equal 'all'

  describe 'Port instance', ->
    p = null
    describe 'initially', ->
      it 'should retain the given type', ->
        p = new port.Port 'string'
        chai.expect(p.type).to.equal 'string'
      it 'should not have a name', ->
        chai.expect(p.name).to.be.a 'null'
      it 'should not have a node name', ->
        chai.expect(p.node).to.be.a 'null'
      it 'should return "Port" as identifier', ->
        chai.expect(p.getId()).to.equal 'Port'

    describe 'with given name and node', ->
      it 'should return correct ID', ->
        p.name = 'out'
        p.node = 'Foo'
        chai.expect(p.getId()).to.equal 'Foo OUT'

    describe 'without attached socket', ->
      it 'should not be attached initially', ->
        chai.expect(p.isAttached()).to.equal false
      it 'should allow a connection', ->
        chai.expect(p.canAttach()).to.equal true
      it 'should not be connected initially', ->
        chai.expect(p.isConnected()).to.equal false
      it 'should not contain a socket initially', ->
        chai.expect(p.socket).to.not.exist
      it 'should not allow connecting', ->
        chai.expect(-> p.connect()).to.throw Error
      it 'should not allow beginning groups', ->
        chai.expect(-> p.beginGroup('Foo')).to.throw Error
      it 'should not allow sending data', ->
        chai.expect(-> p.send('Foo')).to.throw Error
      it 'should not allow ending groups', ->
        chai.expect(-> p.endGroup()).to.throw Error
      it 'should not allow disconnecting', ->
        chai.expect(-> p.disconnect()).to.throw Error

    describe 'with attached socket', ->
      s = new socket.InternalSocket
      s2 = new socket.InternalSocket
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
        chai.expect(p.sockets.length).to.equal 1
        chai.expect(p.sockets[0]).to.equal s
      it 'should allow other sockets to be attached', (done) ->
        chai.expect(p.canAttach()).to.equal true
        p.once 'attach', (sock) ->
          chai.expect(p.sockets.length).to.equal 2
          chai.expect(sock).to.equal s2
          done()
        p.attach s2
      it 'should emit an event on detaching', (done) ->
        p.once 'detach', (sock) ->
          chai.expect(sock).to.equal s
          chai.expect(p.sockets.length).to.equal 1
          done()
        p.detach()
      it 'should still be attached', (done) ->
        chai.expect(p.isAttached()).to.equal true
        p.once 'detach', (sock) ->
          chai.expect(sock).to.equal s2
          done()
        p.detach s2
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
    it 'should connect automatically when sending', (done) ->
      p.once 'connect', (sock, id) ->
        chai.expect(sock).to.equal s
        chai.expect(id).to.equal null
        chai.expect(p.isConnected()).to.equal true
        p.once 'data', (data, id) ->
          chai.expect(data).to.equal 'Baz'
          chai.expect(id).to.equal null
          done()
      s.send 'Baz'

  describe 'Output port', ->
    p = new port.Port
    s = new socket.InternalSocket
    p.attach s
    it 'should connect the socket', (done) ->
      s.once 'connect', ->
        chai.expect(p.isConnected()).to.equal true
        done()
      p.connect()
    it 'should begin groups on the socket', (done) ->
      s.once 'begingroup', (group) ->
        chai.expect(group).to.equal 'Baz'
        done()
      p.beginGroup 'Baz'
    it 'should send data to the socket', (done) ->
      s.once 'data', (data) ->
        chai.expect(data).to.equal 'Foo'
        done()
      p.send 'Foo'
    it 'should end groups on the socket', (done) ->
      s.once 'endgroup', (group) ->
        chai.expect(group).to.equal 'Baz'
        done()
      p.endGroup()
    it 'should disconnect the socket', (done) ->
      s.once 'disconnect', ->
        chai.expect(p.isConnected()).to.equal false
        done()
      p.disconnect()
    it 'should connect automatically when sending', (done) ->
      s.once 'connect', ->
        chai.expect(p.isConnected()).to.equal true
        s.once 'data', (data) ->
          chai.expect(data).to.equal 'Bar'
          done()
      p.send 'Bar'
