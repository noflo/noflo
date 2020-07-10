if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo'
else
  noflo = require 'noflo'

describe 'Inport Port', ->
  describe 'with default options', ->
    p = new noflo.InPort
    it 'should be of datatype "all"', ->
      chai.expect(p.getDataType()).to.equal 'all'
      return
    it 'should not be required', ->
      chai.expect(p.isRequired()).to.equal false
      return
    it 'should not be addressable', ->
      chai.expect(p.isAddressable()).to.equal false
      return
    it 'should not be buffered', ->
      chai.expect(p.isBuffered()).to.equal false
    return
  describe 'with custom type', ->
    p = new noflo.InPort
      datatype: 'string'
      schema: 'text/url'
    it 'should retain the type', ->
      chai.expect(p.getDataType()).to.equal 'string'
      chai.expect(p.getSchema()).to.equal 'text/url'
      return
    return
  describe 'without attached sockets', ->
    p = new noflo.InPort
    it 'should not be attached', ->
      chai.expect(p.isAttached()).to.equal false
      chai.expect(p.listAttached()).to.eql []
      return
    it 'should allow attaching', ->
      chai.expect(p.canAttach()).to.equal true
      return
    it 'should not be connected initially', ->
      chai.expect(p.isConnected()).to.equal false
      return
    it 'should not contain a socket initially', ->
      chai.expect(p.sockets.length).to.equal 0
      return
    return
  describe 'with processing function called with port as context', ->
    it 'should set context to port itself', (done) ->
      s = new noflo.internalSocket.InternalSocket
      p = new noflo.InPort
      p.on 'data', (packet, component) ->
        chai.expect(@).to.equal p
        chai.expect(packet).to.equal 'some-data'
        done()
        return
      p.attach s
      s.send 'some-data'
      return
    return
  describe 'with default value', ->
    p = s = null
    beforeEach ->
      p = new noflo.InPort
        default: 'default-value'
      s = new noflo.internalSocket.InternalSocket
      p.attach s
      return
    it 'should send the default value as a packet, though on next tick after initialization', (done) ->
      p.on 'data', (data) ->
        chai.expect(data).to.equal 'default-value'
        done()
        return
      s.send()
      return
    it 'should send the default value before IIP', (done) ->
      received = ['default-value', 'some-iip']
      p.on 'data', (data) ->
        chai.expect(data).to.equal received.shift()
        done() if received.length is 0
        return
      setTimeout ->
        s.send()
        s.send 'some-iip'
        return
      , 0
      return
    return
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
      return
    return
  describe 'with data type information', ->
    right = 'all string number int object array'.split ' '
    wrong = 'not valie data types'.split ' '
    f = (datatype) ->
      return new noflo.InPort
        datatype: datatype
    right.forEach (r) ->
      it "should accept a '#{r}' data type", =>
        chai.expect(-> f r).to.not.throw()
        return
      return
    wrong.forEach (w) ->
      it "should NOT accept a '#{w}' data type", =>
        chai.expect(-> f w).to.throw()
        return
      return
    return
  describe 'with TYPE (i.e. ontology) information', ->
    f = (type) ->
      return new noflo.InPort
        type: type
    it 'should be a URL or MIME', ->
      chai.expect(-> f 'http://schema.org/Person').to.not.throw()
      chai.expect(-> f 'text/javascript').to.not.throw()
      chai.expect(-> f 'neither-a-url-nor-mime').to.throw()
      return
    return
  describe 'with accepted enumerated values', ->
    it 'should accept certain values', (done) ->
      p = new noflo.InPort
        values: 'noflo is awesome'.split ' '
      s = new noflo.internalSocket.InternalSocket
      p.attach s
      p.on 'data', (data) ->
        chai.expect(data).to.equal 'awesome'
        done()
        return
      s.send 'awesome'

      return
    it 'should throw an error if value is not accepted', ->
      p = new noflo.InPort
        values: 'noflo is awesome'.split ' '
      s = new noflo.internalSocket.InternalSocket
      p.attach s
      p.on 'data', ->
        # Fail the test, we shouldn't have received anything
        chai.expect(true).to.be.equal false
        return
      chai.expect(-> s.send('terrific')).to.throw
      return
    return
  describe 'with processing shorthand', ->
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
      ps.inPorts.in.on 'ip', (ip) ->
        return unless ip.type is 'data'
        chai.expect(ip.data).to.equal 'some-data'
        done()
        return
      ps.inPorts.in.attach s
      chai.expect(ps.inPorts.in.listAttached()).to.eql [0]
      s.send 'some-data'
      s.disconnect()

      return
    it 'should translate IP objects to legacy events', (done) ->
      s = new noflo.internalSocket.InternalSocket
      expectedEvents = [
        'connect'
        'data'
        'disconnect'
      ]
      receivedEvents = []
      ps =
        outPorts: new noflo.OutPorts
          out: new noflo.OutPort
        inPorts: new noflo.InPorts
      ps.inPorts.add 'in',
        datatype: 'string'
        required: true
      ps.inPorts.in.on 'connect', ->
        receivedEvents.push 'connect'
        return
      ps.inPorts.in.on 'data', ->
        receivedEvents.push 'data'
        return
      ps.inPorts.in.on 'disconnect', ->
        receivedEvents.push 'disconnect'
        chai.expect(receivedEvents).to.eql expectedEvents
        done()
        return
      ps.inPorts.in.attach s
      chai.expect(ps.inPorts.in.listAttached()).to.eql [0]
      s.post new noflo.IP 'data', 'some-data'

      return
    it 'should stamp an IP object with the port\'s datatype', (done) ->
      p = new noflo.InPort
        datatype: 'string'
      p.on 'ip', (data) ->
        chai.expect(data).to.be.an 'object'
        chai.expect(data.type).to.equal 'data'
        chai.expect(data.data).to.equal 'Hello'
        chai.expect(data.datatype).to.equal 'string'
        done()
        return
      p.handleIP new noflo.IP 'data', 'Hello'
      return
    it 'should keep an IP object\'s datatype as-is if already set', (done) ->
      p = new noflo.InPort
        datatype: 'string'
      p.on 'ip', (data) ->
        chai.expect(data).to.be.an 'object'
        chai.expect(data.type).to.equal 'data'
        chai.expect(data.data).to.equal 123
        chai.expect(data.datatype).to.equal 'integer'
        done()
        return
      p.handleIP new noflo.IP 'data', 123,
        datatype: 'integer'

      return
    it 'should stamp an IP object with the port\'s schema', (done) ->
      p = new noflo.InPort
        datatype: 'string'
        schema: 'text/markdown'
      p.on 'ip', (data) ->
        chai.expect(data).to.be.an 'object'
        chai.expect(data.type).to.equal 'data'
        chai.expect(data.data).to.equal 'Hello'
        chai.expect(data.datatype).to.equal 'string'
        chai.expect(data.schema).to.equal 'text/markdown'
        done()
        return
      p.handleIP new noflo.IP 'data', 'Hello'
      return
    it 'should keep an IP object\'s schema as-is if already set', (done) ->
      p = new noflo.InPort
        datatype: 'string'
        schema: 'text/markdown'
      p.on 'ip', (data) ->
        chai.expect(data).to.be.an 'object'
        chai.expect(data.type).to.equal 'data'
        chai.expect(data.data).to.equal 'Hello'
        chai.expect(data.datatype).to.equal 'string'
        chai.expect(data.schema).to.equal 'text/plain'
        done()
        return
      p.handleIP new noflo.IP 'data', 'Hello',
        datatype: 'string'
        schema: 'text/plain'
      return
    return
  return