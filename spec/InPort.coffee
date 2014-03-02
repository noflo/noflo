chai = require 'chai' unless chai
if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  inport = require '../src/lib/InPort'
  socket = require '../src/lib/InternalSocket'
else
  inport = require 'noflo/src/lib/InPort.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

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
