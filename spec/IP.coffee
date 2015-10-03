if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  IP = require '../src/lib/IP'
else
  IP = require 'noflo/src/lib/IP'

describe 'IP object', ->
  it 'should create IPs of different types', ->
    open = new IP 'openBracket'
    data = new IP 'data', "Payload"
    close = new IP 'closeBracket'
    chai.expect(open.type).to.equal 'openBracket'
    chai.expect(close.type).to.equal 'closeBracket'
    chai.expect(data.type).to.equal 'data'

  it 'should attach data groups explicitly', ->
    data = new IP 'data', "Payload"
    chai.expect(data.groups).to.be.an.instanceof Array
    chai.expect(data.groups).to.have.lengthOf 0
    data.groups = ['foo', 'bar']
    chai.expect(data.groups).to.have.lengthOf 2

  it 'should be moved to an owner', ->
    p = new IP 'data', "Token"
    p.move 'SomeProc'
    chai.expect(p.owner).to.equal 'SomeProc'

  it 'should support sync context scoping', ->
    p = new IP 'data', "Request-specific"
    p.scope = 'request-12345'
    chai.expect(p.scope).to.equal 'request-12345'

  it 'should be able to clone itself', ->
    d1 = new IP 'data', "Trooper"
    d1.groups = ['foo', 'bar']
    d1.owner = 'SomeProc'
    d1.scope = 'request-12345'
    d2 = d1.clone()
    chai.expect(d2).not.to.equal d1
    chai.expect(d2.type).to.equal d1.type
    chai.expect(d2.data).to.eql d1.data
    chai.expect(d2.groups).to.eql d2.groups
    chai.expect(d2.owner).not.to.equal d1.owner
    chai.expect(d2.scope).to.equal d1.scope

  it 'should dispose its contents when dropped', ->
    p = new IP 'data', "Garbage"
    p.groups = ['foo', 'bar']
    p.drop()
    chai.expect(Object.keys(p)).to.have.lengthOf 0
