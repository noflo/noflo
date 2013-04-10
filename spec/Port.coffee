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
    chai.expect(p.socket).to.equal null

  describe 'Attached socket', ->
    s = new socket.InternalSocket
    it 'should emit an event', (done) ->
      p.once 'attach', (sock) ->
        chai.expect(sock).to.equal s
        done()
      p.attach s
