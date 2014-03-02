chai = require 'chai' unless chai
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  inport = require '../src/lib/InPort'
  outport = require '../src/lib/OutPort'
  socket = require '../src/lib/InternalSocket'
  ports = require '../src/lib/Ports'
else
  inport = require 'noflo/src/lib/InPort.js'
  outport = require 'noflo/src/lib/OutPort'
  socket = require 'noflo/src/lib/InternalSocket.js'
  ports = require 'noflo/src/lib/Ports'

describe 'Inport Port', ->
  describe 'with default options', ->
    p = new inport
    it 'should be of datatype "all"', ->
      chai.expect(p.getDataType()).to.equal 'all'
    it 'should be required', ->
      chai.expect(p.isRequired()).to.equal true
    it 'should not be addressable', ->
      chai.expect(p.isAddressable()).to.equal false
    it 'should not be buffered', ->
      chai.expect(p.isBuffered()).to.equal false
  describe 'with custom type', ->
    p = new inport
      datatype: 'string'
      type: 'text/url'
    it 'should retain the type', ->
      chai.expect(p.getDataType()).to.equal 'string'
      chai.expect(p.options.type).to.equal 'text/url'

  describe 'without attached sockets', ->
    p = new inport
    it 'should not be attached', ->
      chai.expect(p.isAttached()).to.equal false
    it 'should allow attaching', ->
      chai.expect(p.canAttach()).to.equal true
    it 'should not be connected initially', ->
      chai.expect(p.isConnected()).to.equal false
    it 'should not contain a socket initially', ->
      chai.expect(p.sockets.length).to.equal 0

  describe 'with default value', ->
    p = s = null
    beforeEach ->
      p = new inport
        default: 'default-value'
      s = new socket
      p.attach s
    it 'should send the default value as a packet, though on next tick after initialization', (done) ->
      p.config.on 'data', (data) ->
        chai.expect(data).toEqual 'default-value'
        done()
    it 'should send the default value before IIP', (done) ->
      received = ['default-value', 'some-iip']
      p.config.on 'data', (data) ->
        chai.expect(data).toEqual received.shift()
        done() if received.length is 0
      s.send 'some-iip'

  describe 'with options stored in port', ->
    it 'should store all provided options in port, whether we expect it or not', ->
      options =
        datatype: 'string'
        type: 'http://schema.org/Person'
        description: 'Person'
        required: true
        weNeverExpectThis: 'butWeStoreItAnyway'
      p = new inport options
      for name, option of options
        chai.expect(p.options[name]).toEqual option

  describe 'with data type information', ->
    right = 'all string number int object array'.split ' '
    wrong = 'not valie data types'.split ' '
    f = (datatype) ->
      new inport
        datatype: datatype
    right.forEach (r) ->
      it "should accept a '#{r}' data type", =>
        chai.expect(-> f r).to.not.throw()
    wrong.forEach (w) ->
      it "should NOT accept a '#{w}' data type", =>
        chai.expect(-> f w).to.throw()

  describe 'with TYPE (i.e. ontology) information', ->
    f = (type) ->
      new inport
        type: type
    it 'should be a URL', ->
      chai.expect(-> f 'http://schema.org/Person').to.not.throw()
      chai.expect(-> f 'not-a-url').to.throw()

  describe 'with buffering', ->
    it 'should buffer incoming packets until `receive()`d', ->
      p = new inport
        buffered: true
      s = new socket
      p.attach s

      p.once 'data', (data) ->
        # We get notified with the packet as the parameter but it is not popped
        # off the queue. We choose not to handle the packet for now.
        chai.expect(data).toEqual 'buffered-data-1'
      s.send 'buffered-data-1'

      p.once 'data', (data) ->
        # We should still get the queued up value because it doesn't make sense
        # to "peek" into the latest packet until all preceding packets have
        # been consumed.
        chai.expect(data).toEqual 'buffered-data-1'
        # Now we consume it. Note that the context should the port itself.
        _data = @receive()
        chai.expect(data).toEqual _data
      s.send 'buffered-data-2'

      p.once 'data', (data) ->
        # Now we see the second packet
        chai.expect(data).toEqual 'buffered-data-2'
      s.send 'buffered-data-3'

    it 'should always return the immediate packet even without buffering', ->
      p = new inport
        # Specified here simply for illustrative purpose, otherwise implied
        # `false`
        buffered: false
      s = new socket
      p.attach s

      p.once 'data', (data) ->
        # `receive()` returns the same thing
        _data = @receive()
        chai.expect(data).toEqual 'data'
        chai.expect(data).toEqual _data
      s.send 'data'

  describe 'with accepted enumerated values', (done) ->
    it 'should accept certain values', ->
      p = new inport
        values: 'noflo is awesome'.split ''
      s = new socket
      p.attach s
      p.on 'data', (data) ->
        chai.expect(data).toEqual 'noflo is awesome'
        done()
      s.send 'awesome'

    it 'should send to error port if value is not accepted', ->
      p = new inport
        values: 'noflo is awesome'.split ''
      s = new socket
      p.attach s
      cb = jasmine.createSpy()
      p.on 'data', cb
      s.send 'terrific'
      chai.expect(cb).not.toHaveBeenCalled()

  describe 'with processing shorthand', ->
    it 'should create a port with a callback', ->
      s = new socket
      ps = new ports
        outPorts:
          out: new outport
      ps.add 'in', (packet, outPorts) ->
        chai.expect(packet).toEqual 'some-data'
        chai.assert outPorts.out instanceof outport
      chai.assert ps.inPorts.in instanceof inport
      ps.inPorts.in.attach s
      s.send 'some-data'
