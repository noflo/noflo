chai = require 'chai' unless chai
if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
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
      chai.expect(p.listAttached()).to.eql [0, 1, 2]
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

    it 'should give correct port index when detaching a connection', (done) ->
      p = new outport
        addressable: true
      p.attach s1, 3
      p.attach s2, 1
      p.attach s3, 5
      expectedSockets = [s2, s3]
      expected = [1, 5]
      expectedAttached = [
        [3, 5]
        [3]
      ]
      p.on 'detach', (socket, index) ->
        chai.expect(socket).to.equal expectedSockets.shift()
        chai.expect(index).to.equal expected.shift()
        chai.expect(p.isAttached(index)).to.equal false
        atts = expectedAttached.shift()
        chai.expect(p.listAttached()).to.eql atts
        for att in atts
          chai.expect(p.isAttached(att)).to.equal true
        done() unless expected.length
      p.detach s2
      p.detach s3

  describe 'with caching ports', ->
    s1 = s2 = s3 = null
    beforeEach ->
      s1 = new socket.InternalSocket
      s2 = new socket.InternalSocket
      s3 = new socket.InternalSocket

    it 'should repeat the previously sent value on attach event', (done) ->
      p = new outport
        caching: true

      s1.once 'data', (data) ->
        chai.expect(data).to.equal 'foo'

      s2.once 'data', (data) ->
        chai.expect(data).to.equal 'foo'
        # Next value should be different
        s2.once 'data', (data) ->
          chai.expect(data).to.equal 'bar'
          done()

      p.attach s1
      p.send 'foo'
      p.disconnect()

      p.attach s2

      p.send 'bar'
      p.disconnect()


    it 'should support addressable ports', (done) ->
      p = new outport
        addressable: true
        caching: true

      p.attach s1
      p.attach s2

      s1.on 'data', ->
        chai.expect(true).to.equal false
      s2.on 'data', (data) ->
        chai.expect(data).to.equal 'some-data'
      s3.on 'data', (data) ->
        chai.expect(data).to.equal 'some-data'
        done()

      p.send 'some-data', 1
      p.disconnect 1
      p.detach s2
      p.attach s3, 1
