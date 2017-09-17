if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
else
  noflo = require 'noflo'

describe 'IP object', ->
  it 'should create IPs of different types', ->
    open = new noflo.IP 'openBracket'
    data = new noflo.IP 'data', "Payload"
    close = new noflo.IP 'closeBracket'
    chai.expect(open.type).to.equal 'openBracket'
    chai.expect(close.type).to.equal 'closeBracket'
    chai.expect(data.type).to.equal 'data'

  it 'should be moved to an owner', ->
    p = new noflo.IP 'data', "Token"
    p.move 'SomeProc'
    chai.expect(p.owner).to.equal 'SomeProc'

  it 'should support sync context scoping', ->
    p = new noflo.IP 'data', "Request-specific"
    p.scope = 'request-12345'
    chai.expect(p.scope).to.equal 'request-12345'

  it 'should be able to clone itself', ->
    d1 = new noflo.IP 'data', "Trooper",
      groups: ['foo', 'bar']
      owner: 'SomeProc'
      scope: 'request-12345'
      clonable: true
      datatype: 'string'
      schema: 'text/plain'
    d2 = d1.clone()
    chai.expect(d2).not.to.equal d1
    chai.expect(d2.type).to.equal d1.type
    chai.expect(d2.schema).to.equal d1.schema
    chai.expect(d2.data).to.eql d1.data
    chai.expect(d2.groups).to.eql d2.groups
    chai.expect(d2.owner).not.to.equal d1.owner
    chai.expect(d2.scope).to.equal d1.scope

  it 'should dispose its contents when dropped', ->
    p = new noflo.IP 'data', "Garbage"
    p.groups = ['foo', 'bar']
    p.drop()
    chai.expect(Object.keys(p)).to.have.lengthOf 0
