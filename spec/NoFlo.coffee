if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo'
  path = require('path')
  browser = false
else
  noflo = require 'noflo'
  browser = true

describe 'NoFlo interface', ->
  it 'should be able to tell whether it is running on browser', ->
    chai.expect(noflo.isBrowser()).to.equal browser
    return
  describe 'working with graph files', ->
    targetPath = null
    before ->
      # These features only work on Node.js
      if noflo.isBrowser()
        @skip()
        return
      targetPath = path.resolve __dirname, 'tmp.json'
      return
    after (done) ->
      if noflo.isBrowser()
        done()
        return
      fs = require 'fs'
      fs.unlink targetPath, done
      return
    it 'should be able to save a graph file', (done) ->
      graph = new noflo.Graph
      graph.addNode 'G', 'Graph'
      noflo.saveFile graph, targetPath, done
      return
    it 'should be able to load a graph file', (done) ->
      noflo.loadFile targetPath,
        baseDir: process.cwd()
        delay: true
      , (err, network) ->
        if err
          done err
          return
        chai.expect(network.isRunning()).to.equal false
        done()
        return
      return
    return
  return
