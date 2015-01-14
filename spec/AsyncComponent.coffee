if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  acomponent = require '../src/lib/AsyncComponent.coffee'
  port = require '../src/lib/Port.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
else
  acomponent = require 'noflo/src/lib/AsyncComponent.js'
  port = require 'noflo/src/lib/Port.js'
  socket = require 'noflo/src/lib/InternalSocket.js'

describe 'AsyncComponent with missing ports', ->
  class C1 extends acomponent.AsyncComponent
  class C2 extends acomponent.AsyncComponent
    constructor: ->
      @inPorts =
        in: new port.Port
      super()

  it 'should throw an error on instantiation when no IN defined', ->
    chai.expect(-> new C1).to.throw Error
  it 'should throw an error on instantion when no OUT defined', ->
    chai.expect(-> new C2).to.throw Error

describe 'AsyncComponent without a doAsync method', ->
  class Unimplemented extends acomponent.AsyncComponent
    constructor: ->
      @inPorts =
        in: new port.Port
      @outPorts =
        out: new port.Port
        error: new port.Port
      super()

  it 'should throw an error if there is no connection to the ERROR port', ->
    u = new Unimplemented
    ins = socket.createSocket()
    u.inPorts.in.attach ins
    chai.expect(-> ins.send 'Foo').to.throw Error

  it 'should send an error to the ERROR port if connected', (done) ->
    u = new Unimplemented
    ins = socket.createSocket()
    u.inPorts.in.attach ins
    err = socket.createSocket()
    u.outPorts.error.attach err
    err.on 'data', (data) ->
      chai.expect(data).to.be.an.instanceof Error
      done()
    ins.send 'Bar'

  it 'should send groups and error to the ERROR port if connected', (done) ->
    u = new Unimplemented
    ins = socket.createSocket()
    u.inPorts.in.attach ins
    err = socket.createSocket()
    groups = [
      'one'
      'two'
      'three'
      'one'
      'two'
      'four'
    ]
    u.outPorts.out.attach socket.createSocket()
    u.outPorts.error.attach err
    err.on 'begingroup', (group) ->
      chai.expect(group).to.equal groups.shift()
    received = 0
    err.on 'data', (data) ->
      received++
      chai.expect(data).to.be.an.instanceof Error
      if received is 2
        chai.expect(groups.length).to.equal 0
        done()

    ins.beginGroup group for group in ['one', 'two', 'three']
    ins.send 'Bar'
    ins.endGroup()
    ins.beginGroup 'four'
    ins.send 'Baz'
    ins.endGroup() for group in [0..2]

describe 'Implemented AsyncComponent', ->
  class Timer extends acomponent.AsyncComponent
    constructor: ->
      @inPorts =
        in: new port.Port
      @outPorts =
        out: new port.Port
        error: new port.Port
      super()
    doAsync: (data, callback) ->
      setTimeout (=>
        @outPorts.out.send "waited #{data}"
        callback()
      ), data
  t = null
  ins = null
  out = null
  lod = null
  err = null

  beforeEach ->
    t = new Timer
    ins = socket.createSocket()
    out = socket.createSocket()
    lod = socket.createSocket()
    err = socket.createSocket()
    t.inPorts.in.attach ins
    t.outPorts.out.attach out
    t.outPorts.load.attach lod
    t.outPorts.error.attach err

  it 'should send load information and packets in correct order', (done) ->
    received = []
    expected = [
      'load 1'
      'load 2'
      'load 3'
      'out waited 100'
      'load 2'
      'out waited 200'
      'load 1'
      'out waited 300'
      'load 0'
    ]

    inspect = ->
      chai.expect(received.length).to.equal expected.length
      for value, key in expected
        chai.expect(received[key]).to.equal value
      done()

    out.on 'data', (data) ->
      received.push "out #{data}"
    lod.on 'data', (data) ->
      received.push "load #{data}"
      do inspect if data is 0

    ins.send 300
    ins.send 200
    ins.send 100
    ins.disconnect()
