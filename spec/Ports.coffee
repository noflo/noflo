if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
else
  noflo = require 'noflo'

describe 'Ports collection', ->
  describe 'InPorts', ->
    p = new noflo.InPorts
    it 'should initially contain no ports', ->
      chai.expect(p.ports).to.eql {}
    it 'should allow adding a port', ->
      p.add 'foo',
        datatype: 'string'
      chai.expect(p.ports['foo']).to.be.an 'object'
      chai.expect(p.ports['foo'].getDataType()).to.equal 'string'
    it 'should allow overriding  a port', ->
      p.add 'foo',
        datatype: 'boolean'
      chai.expect(p.ports['foo']).to.be.an 'object'
      chai.expect(p.ports['foo'].getDataType()).to.equal 'boolean'
    it 'should throw if trying to add an \'add\' port', ->
      chai.expect(-> p.add 'add').to.throw()
    it 'should throw if trying to add an \'remove\' port', ->
      chai.expect(-> p.add 'remove').to.throw()
    it 'should throw if trying to add a port with invalid characters', ->
      chai.expect(-> p.add 'hello world!').to.throw()
    it 'should throw if trying to remove a port that doesn\'t exist', ->
      chai.expect(-> p.remove 'bar').to.throw()
    it 'should throw if trying to subscribe to a port that doesn\'t exist', ->
      chai.expect(-> p.once 'bar', 'ip', ->).to.throw()
      chai.expect(-> p.on 'bar', 'ip', ->).to.throw()
    it 'should allow subscribing to an existing port', (done) ->
      received = 0
      p.once 'foo', 'ip', (packet) ->
        received++
        return done() if received is 2
      p.on 'foo', 'ip', (packet) ->
        received++
        return done() if received is 2
      p.foo.handleIP new noflo.IP 'data', null
    it 'should be able to remove a port', ->
      p.remove 'foo'
      chai.expect(p.ports).to.eql {}
  describe 'OutPorts', ->
    p = new noflo.OutPorts
    it 'should initially contain no ports', ->
      chai.expect(p.ports).to.eql {}
    it 'should allow adding a port', ->
      p.add 'foo',
        datatype: 'string'
      chai.expect(p.ports['foo']).to.be.an 'object'
      chai.expect(p.ports['foo'].getDataType()).to.equal 'string'
    it 'should throw if trying to add an \'add\' port', ->
      chai.expect(-> p.add 'add').to.throw()
    it 'should throw if trying to add an \'remove\' port', ->
      chai.expect(-> p.add 'remove').to.throw()
    it 'should throw when calling connect with port that doesn\'t exist', ->
      chai.expect(-> p.connect 'bar').to.throw()
    it 'should throw when calling beginGroup with port that doesn\'t exist', ->
      chai.expect(-> p.beginGroup 'bar').to.throw()
    it 'should throw when calling send with port that doesn\'t exist', ->
      chai.expect(-> p.send 'bar').to.throw()
    it 'should throw when calling endGroup with port that doesn\'t exist', ->
      chai.expect(-> p.endGroup 'bar').to.throw()
    it 'should throw when calling disconnect with port that doesn\'t exist', ->
      chai.expect(-> p.disconnect 'bar').to.throw()
