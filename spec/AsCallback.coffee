if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
  urlPrefix = './'
else
  noflo = require 'noflo'
  root = 'noflo'
  urlPrefix = '/'

describe 'asCallback interface', ->
  loader = null

  processAsync = ->
    c = new noflo.Component
    c.inPorts.add 'in',
      datatype: 'string'
    c.outPorts.add 'out',
      datatype: 'string'

    c.process (input, output) ->
      data = input.getData 'in'
      setTimeout ->
        output.sendDone data
      , 1

  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents (err) ->
      return done err if err
      loader.registerComponent 'process', 'Async', processAsync
      done()
  describe 'with a non-existing component', ->
    wrapped = null
    before ->
      wrapped = noflo.asCallback 'foo/Bar',
        loader: loader
    it 'should be able to wrap it', (done) ->
      chai.expect(wrapped).to.be.a 'function'
      chai.expect(wrapped.length).to.equal 2
      done()
    it 'should fail execution', (done) ->
      wrapped 1, (err) ->
        chai.expect(err).to.be.an 'error'
        done()
  describe 'with simple asynchronous component', ->
    wrapped = null
    before ->
      wrapped = noflo.asCallback 'process/Async',
        loader: loader
    it 'should be able to wrap it', (done) ->
      chai.expect(wrapped).to.be.a 'function'
      chai.expect(wrapped.length).to.equal 2
      done()
    it 'should execute network with input map and provide output map', (done) ->
      expected =
        hello: 'world'

      wrapped
        in: expected
      , (err, out) ->
        return done err if err
        chai.expect(out.out).to.eql expected
        done()
    it 'should execute network with simple input and provide simple output', (done) ->
      expected =
        hello: 'world'

      wrapped expected, (err, out) ->
        return done err if err
        chai.expect(out).to.eql expected
        done()
