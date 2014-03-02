chai = require 'chai' unless chai
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  outport = require '../src/lib/OutPort'
  socket = require '../src/lib/InternalSocket'
else
  outport = require 'noflo/src/lib/OutPort.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'Outport Port', ->
  describe 'with addressable ports', ->
    s1 = s2 = s3 = null
    beforeEach ->
      s1 = new socket.InternalSocket
      s2 = new socket.InternalSocket
      s3 = new socket.InternalSocket

    it 'should be able to send to a specific port', ->
      p = new outport
        addressable: true
      p.attach s1
      p.attach s2
      p.attach s3
      s1.on 'data', ->
        chai.expect(true).to.equal false
      s2.on 'data', (data) ->
        chai.expect(data).to.equal 'some-data'
      s3.on 'data', ->
        chai.expect(true).to.equal false
      p.send 'some-data', 1

    it 'should throw an error when sent data without address', ->
      chai.expect(-> p.send('some-data')).to.throw

    it 'should throw an error when a specific port is requested with non-addressable port', ->
      p = new outport
      p.attach s1
      p.attach s2
      p.attach s3
      chai.expect(-> p.send('some-data', 1)).to.throw
