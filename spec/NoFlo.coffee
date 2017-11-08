if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  path = require('path')
  browser = false
else
  noflo = require 'noflo'
  browser = true

describe 'NoFlo interface', ->
  it 'should be able to tell whether it is running on browser', ->
    chai.expect(noflo.isBrowser()).to.equal browser
  describe 'working with graph files', ->
    targetPath = null
    before ->
      # These features only work on Node.js
      return @skip() if noflo.isBrowser()
      targetPath = path.resolve __dirname, 'tmp.json'
    after (done) ->
      return done() if noflo.isBrowser()
      fs = require 'fs'
      fs.unlink targetPath, done
    it 'should be able to save a graph file', (done) ->
      graph = new noflo.Graph
      graph.addNode 'G', 'Graph'
      noflo.saveFile graph, targetPath, done
    it 'should be able to load a graph file', (done) ->
      noflo.loadFile targetPath,
        baseDir: process.cwd()
        delay: true
      , (err, network) ->
        return done err if err
        chai.expect(network.isRunning()).to.equal false
        done()
