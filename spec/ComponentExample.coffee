if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  component = require '../src/lib/Component.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
  IP = require '../src/lib/IP.coffee'
  MergeObjects = require './components/MergeObjects.coffee'
else
  component = require 'noflo/src/lib/Component.js'
  socket = require 'noflo/src/lib/InternalSocket.js'
  IP = require 'noflo/src/lib/IP.js'
  MergeObjects = require 'noflo/spec/components/MergeObjects.coffee'

describe 'MergeObjects component', ->
  c = null
  sin1 = null
  sin2 = null
  sin3 = null
  sout1 = null
  sout2 = null
  obj1 =
    name: 'Patrick'
    age: 21
  obj2 =
    title: 'Attorney'
    age: 33
  before (done) ->
    c = MergeObjects.getComponent()
    sin1 = new socket.InternalSocket
    sin2 = new socket.InternalSocket
    sin3 = new socket.InternalSocket
    sout1 = new socket.InternalSocket
    sout2 = new socket.InternalSocket
    c.inPorts.obj1.attach sin1
    c.inPorts.obj2.attach sin2
    c.inPorts.overwrite.attach sin3
    c.outPorts.result.attach sout1
    c.outPorts.error.attach sout2
    done()
  beforeEach (done) ->
    sout1.removeAllListeners()
    sout2.removeAllListeners()
    done()

  it 'should not trigger if input is not complete', (done) ->
    sout1.once 'ip', (ip) ->
      done new Error "Premature result"
    sout2.once 'ip', (ip) ->
      done new Error "Premature error"

    sin1.post new IP 'data', obj1
    sin2.post new IP 'data', obj2

    setTimeout done, 10

  it 'should merge objects when input is complete', (done) ->
    sout1.once 'ip', (ip) ->
      chai.expect(ip).to.be.an 'object'
      chai.expect(ip.type).to.equal 'data'
      chai.expect(ip.data).to.be.an 'object'
      chai.expect(ip.data.name).to.equal obj1.name
      chai.expect(ip.data.title).to.equal obj2.title
      chai.expect(ip.data.age).to.equal obj1.age
      done()
    sout2.once 'ip', (ip) ->
      done ip

    sin3.post new IP 'data', false

  it 'should obey the overwrite control', (done) ->
    sout1.once 'ip', (ip) ->
      chai.expect(ip).to.be.an 'object'
      chai.expect(ip.type).to.equal 'data'
      chai.expect(ip.data).to.be.an 'object'
      chai.expect(ip.data.name).to.equal obj1.name
      chai.expect(ip.data.title).to.equal obj2.title
      chai.expect(ip.data.age).to.equal obj2.age
      done()
    sout2.once 'ip', (ip) ->
      done ip

    sin3.post new IP 'data', true
    sin1.post new IP 'data', obj1
    sin2.post new IP 'data', obj2
