if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
  urlPrefix = './'
  isBrowser = false
else
  noflo = require 'noflo'
  root = 'noflo'
  urlPrefix = '/'
  isBrowser = true

describe 'asComponent interface', ->
  loader = null
  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents done
  describe 'with a synchronous function taking a single parameter', ->
    describe 'with returned value', ->
      func = (hello) ->
        return "Hello #{hello}"
      it 'should be possible to componentize', (done) ->
        component = -> noflo.asComponent func
        loader.registerComponent 'ascomponent', 'sync-one', component, done
      it 'should be loadable', (done) ->
        loader.load 'ascomponent/sync-one', done
      it 'should contain correct ports', (done) ->
        loader.load 'ascomponent/sync-one', (err, instance) ->
          return done err if err
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql ['hello']
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql ['out', 'error']
          done()
      it 'should send to OUT port', (done) ->
        wrapped = noflo.asCallback 'ascomponent/sync-one',
          loader: loader
        wrapped 'World', (err, res) ->
          return done err if err
          chai.expect(res).to.equal 'Hello World'
          done()
    describe 'with a thrown exception', ->
      func = (hello) ->
        throw new Error "Hello #{hello}"
      it 'should be possible to componentize', (done) ->
        component = -> noflo.asComponent func
        loader.registerComponent 'ascomponent', 'sync-throw', component, done
      it 'should send to ERROR port', (done) ->
        wrapped = noflo.asCallback 'ascomponent/sync-throw',
          loader: loader
        wrapped 'Error', (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.equal 'Hello Error'
          done()
  describe 'with a synchronous function taking a multiple parameters', ->
    describe 'with returned value', ->
      func = (greeting, name) ->
        return "#{greeting} #{name}"
      it 'should be possible to componentize', (done) ->
        component = -> noflo.asComponent func
        loader.registerComponent 'ascomponent', 'sync-two', component, done
      it 'should be loadable', (done) ->
        loader.load 'ascomponent/sync-two', done
      it 'should contain correct ports', (done) ->
        loader.load 'ascomponent/sync-two', (err, instance) ->
          return done err if err
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql ['greeting', 'name']
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql ['out', 'error']
          done()
      it 'should send to OUT port', (done) ->
        wrapped = noflo.asCallback 'ascomponent/sync-two',
          loader: loader
        wrapped
          greeting: 'Hei'
          name: 'Maailma'
        , (err, res) ->
          return done err if err
          chai.expect(res).to.eql
            out: 'Hei Maailma'
          done()
  describe 'with a function returning a Promise', ->
    before ->
      if isBrowser and typeof window.Promise is 'undefined'
        return @skip()
    describe 'with a resolved promise', ->
      func = (hello) ->
        return new Promise (resolve, reject) ->
          setTimeout ->
            resolve "Hello #{hello}"
          , 5
      it 'should be possible to componentize', (done) ->
        component = -> noflo.asComponent func
        loader.registerComponent 'ascomponent', 'promise-one', component, done
      it 'should send to OUT port', (done) ->
        wrapped = noflo.asCallback 'ascomponent/promise-one',
          loader: loader
        wrapped 'World', (err, res) ->
          return done err if err
          chai.expect(res).to.equal 'Hello World'
          done()
    describe 'with a rejected promise', ->
      func = (hello) ->
        return new Promise (resolve, reject) ->
          setTimeout ->
            reject new Error "Hello #{hello}"
          , 5
      it 'should be possible to componentize', (done) ->
        component = -> noflo.asComponent func
        loader.registerComponent 'ascomponent', 'sync-throw', component, done
      it 'should send to ERROR port', (done) ->
        wrapped = noflo.asCallback 'ascomponent/sync-throw',
          loader: loader
        wrapped 'Error', (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.equal 'Hello Error'
          done()
