if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
else
  noflo = require 'noflo'

describe 'Inport Port', ->
  describe 'with default options', ->
    p = new noflo.InPort
    it 'should be of datatype "all"', ->
      chai.expect(p.getDataType()).to.equal 'all'
    it 'should not be required', ->
      chai.expect(p.isRequired()).to.equal false
    it 'should not be addressable', ->
      chai.expect(p.isAddressable()).to.equal false
    it 'should not be buffered', ->
      chai.expect(p.isBuffered()).to.equal false
  describe 'with custom type', ->
    p = new noflo.InPort
      datatype: 'string'
      type: 'text/url'
    it 'should retain the type', ->
      chai.expect(p.getDataType()).to.equal 'string'
      chai.expect(p.options.type).to.equal 'text/url'

  describe 'without attached sockets', ->
    p = new noflo.InPort
    it 'should not be attached', ->
      chai.expect(p.isAttached()).to.equal false
      chai.expect(p.listAttached()).to.eql []
    it 'should allow attaching', ->
      chai.expect(p.canAttach()).to.equal true
    it 'should not be connected initially', ->
      chai.expect(p.isConnected()).to.equal false
    it 'should not contain a socket initially', ->
      chai.expect(p.sockets.length).to.equal 0

  describe 'with processing function called with port as context', ->
    it 'should set context to port itself', (done) ->
      s = new noflo.internalSocket.InternalSocket
      p = new noflo.InPort
      p.on 'data', (packet, component) ->
        chai.expect(@).to.equal p
        chai.expect(packet).to.equal 'some-data'
        done()
      p.attach s
      s.send 'some-data'

  describe 'with default value', ->
    p = s = null
    beforeEach ->
      p = new noflo.InPort
        default: 'default-value'
      s = new noflo.internalSocket.InternalSocket
      p.attach s
    it 'should send the default value as a packet, though on next tick after initialization', (done) ->
      p.on 'data', (data) ->
        chai.expect(data).to.equal 'default-value'
        done()
      s.send()
    it 'should send the default value before IIP', (done) ->
      received = ['default-value', 'some-iip']
      p.on 'data', (data) ->
        chai.expect(data).to.equal received.shift()
        done() if received.length is 0
      setTimeout ->
        s.send()
        s.send 'some-iip'
      , 0

  describe 'with options stored in port', ->
    it 'should store all provided options in port, whether we expect it or not', ->
      options =
        datatype: 'string'
        type: 'http://schema.org/Person'
        description: 'Person'
        required: true
        weNeverExpectThis: 'butWeStoreItAnyway'
      p = new noflo.InPort options
      for name, option of options
        chai.expect(p.options[name]).to.equal option

  describe 'with data type information', ->
    right = 'all string number int object array'.split ' '
    wrong = 'not valie data types'.split ' '
    f = (datatype) ->
      new noflo.InPort
        datatype: datatype
    right.forEach (r) ->
      it "should accept a '#{r}' data type", =>
        chai.expect(-> f r).to.not.throw()
    wrong.forEach (w) ->
      it "should NOT accept a '#{w}' data type", =>
        chai.expect(-> f w).to.throw()

  describe 'with TYPE (i.e. ontology) information', ->
    f = (type) ->
      new noflo.InPort
        type: type
    it 'should be a URL or MIME', ->
      chai.expect(-> f 'http://schema.org/Person').to.not.throw()
      chai.expect(-> f 'text/javascript').to.not.throw()
      chai.expect(-> f 'neither-a-url-nor-mime').to.throw()

  describe 'with buffering', ->
    it 'should buffer incoming packets until `receive()`d', (done) ->
      expectedEvents = [
        'connect'
        'data'
        'data'
        'disconnect'
        'connect'
        'data'
        'disconnect'
      ]
      expectedData = [
        'buffered-data-1'
        'buffered-data-2'
        'buffered-data-3'
      ]

      p = new noflo.InPort
        buffered: true
      , (eventName) ->
        expectedEvent = expectedEvents.shift()
        chai.expect(eventName).to.equal expectedEvent
        packet = p.receive()
        chai.expect(packet).to.be.an 'object'
        chai.expect(packet.event).to.equal expectedEvent
        if packet.event is 'data'
          chai.expect(packet.payload).to.equal expectedData.shift()
        if expectedEvents.length is 0
          done()
      s = new noflo.internalSocket.InternalSocket
      p.attach s
      s.send 'buffered-data-1'
      s.send 'buffered-data-2'
      s.disconnect()
      s.send 'buffered-data-3'
      s.disconnect()

    it 'should be able to tell the number of contained data packets', ->
      p = new noflo.InPort
        buffered: true
      s = new noflo.internalSocket.InternalSocket
      p.attach s
      s.send 'buffered-data-1'
      s.beginGroup 'foo'
      s.send 'buffered-data-2'
      s.endGroup()
      s.disconnect()
      s.send 'buffered-data-3'
      s.disconnect()
      chai.expect(p.contains()).to.equal 3

    it 'should return undefined when buffer is empty', ->
      p = new noflo.InPort
        buffered: true
      chai.expect(p.receive()).to.be.undefined

    it 'shouldn\'t expose the receive method without buffering', ->
      p = new noflo.InPort
        # Specified here simply for illustrative purpose, otherwise implied
        # `false`
        buffered: false
      s = new noflo.internalSocket.InternalSocket
      p.attach s

      p.once 'data', (data) ->
        chai.expect(data).to.equal 'data'
        # Receive is not available for non-buffering ports
        chai.expect(-> p.receive()).to.throw()
        # Contains is not available for non-buffering ports
        chai.expect(-> p.contains()).to.throw()
      s.send 'data'

  describe 'with accepted enumerated values', ->
    it 'should accept certain values', (done) ->
      p = new noflo.InPort
        values: 'noflo is awesome'.split ' '
      s = new noflo.internalSocket.InternalSocket
      p.attach s
      p.on 'data', (data) ->
        chai.expect(data).to.equal 'awesome'
        done()
      s.send 'awesome'

    it 'should throw an error if value is not accepted', ->
      p = new noflo.InPort
        values: 'noflo is awesome'.split ' '
      s = new noflo.internalSocket.InternalSocket
      p.attach s
      p.on 'data', ->
        # Fail the test, we shouldn't have received anything
        chai.expect(true).to.be.equal false

      chai.expect(-> s.send('terrific')).to.throw

  describe 'with processing shorthand', ->
    it 'should create a port with a callback', ->
      s = new noflo.internalSocket.InternalSocket
      ps =
        outPorts: new noflo.OutPorts
          out: new noflo.OutPort
        inPorts: new noflo.InPorts
      ps.inPorts.add 'in', (event, payload) ->
        return unless event is 'data'
        chai.expect(payload).to.equal 'some-data'
      chai.assert ps.inPorts.in instanceof noflo.InPort
      ps.inPorts.in.attach s
      s.send 'some-data'

    it 'should also accept metadata (i.e. options) when provided', (done) ->
      s = new noflo.internalSocket.InternalSocket
      expectedEvents = [
        'connect'
        'data'
        'disconnect'
      ]
      ps =
        outPorts: new noflo.OutPorts
          out: new noflo.OutPort
        inPorts: new noflo.InPorts
      ps.inPorts.add 'in',
        datatype: 'string'
        required: true
      , (event, payload) ->
        chai.expect(event).to.equal expectedEvents.shift()
        return unless event is 'data'
        chai.expect(payload).to.equal 'some-data'
        done()
      ps.inPorts.in.attach s
      chai.expect(ps.inPorts.in.listAttached()).to.eql [0]
      s.send 'some-data'
      s.disconnect()

  describe 'with IP handle callback option', ->
    it 'should pass IP objects to handler', (done) ->
      s = new noflo.internalSocket.InternalSocket
      ps =
        outPorts: new noflo.OutPorts
          out: new noflo.OutPort
        inPorts: new noflo.InPorts
      ps.inPorts.add 'in',
        datatype: 'string'
        required: true
        handle: (ip) ->
          chai.expect(ip).to.be.an 'object'
          return unless ip.type is 'data'
          chai.expect(ip.data).to.equal 'some-data'
          done()

      ps.inPorts.in.attach s
      chai.expect(ps.inPorts.in.listAttached()).to.eql [0]
      s.send type: 'data', data: 'some-data'

    it 'should translate legacy events to IP objects', (done) ->
      s = new noflo.internalSocket.InternalSocket
      expectedEvents = [
        'openBracket'
        'data'
        'closeBracket'
      ]
      ps =
        outPorts: new noflo.OutPorts
          out: new noflo.OutPort
        inPorts: new noflo.InPorts
      ps.inPorts.add 'in',
        datatype: 'string'
        required: true
        handle: (ip) ->
          chai.expect(ip).to.be.an 'object'
          chai.expect(ip.type).to.equal expectedEvents.shift()
          if ip.type is 'data'
            chai.expect(ip.data).to.equal 'some-data'
          # if ip.type is 'openBracket'
          #   chai.expect(ip.groups).to.be.an 'array'
          if ip.type is 'closeBracket'
            done()

      ps.inPorts.in.attach s
      chai.expect(ps.inPorts.in.listAttached()).to.eql [0]
      s.send 'some-data'
      s.disconnect()

    it 'should translate IP objects to legacy events', (done) ->
      s = new noflo.internalSocket.InternalSocket
      expectedEvents = [
        'connect'
        'data'
        'disconnect'
      ]
      ps =
        outPorts: new noflo.OutPorts
          out: new noflo.OutPort
        inPorts: new noflo.InPorts
      ps.inPorts.add 'in',
        datatype: 'string'
        required: true
      , (event, payload) ->
        chai.expect(event).to.equal expectedEvents.shift()
        return unless event is 'data'
        chai.expect(payload).to.equal 'some-data'
        done()
      ps.inPorts.in.attach s
      chai.expect(ps.inPorts.in.listAttached()).to.eql [0]
      s.post new noflo.IP 'data', 'some-data'
