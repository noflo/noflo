if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  network = require '../src/lib/Network.coffee'
  graph = require '../src/lib/Graph.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  network = require 'noflo/lib/Network.js'
  graph = require 'noflo/lib/Graph.js'
  root = '/noflo/'

describe 'Network with an empty graph', ->
  g = new graph.Graph
  g.baseDir = root
  n = new network.Network g

  it 'should initially have no processes', ->
    chai.expect(n.processes).to.be.empty
  it 'should initially have to connections', ->
    chai.expect(n.connections).to.be.empty
  it 'should initially have no IIPs', ->
    chai.expect(n.initials).to.be.empty
  it 'should have reference to the graph', ->
    chai.expect(n.graph).to.equal g
  it 'should know its baseDir', ->
    chai.expect(n.baseDir).to.equal g.baseDir
  it 'should have a ComponentLoader', ->
    chai.expect(n.loader).to.be.an 'object'
  it 'should have transmitted the baseDir to the Component Loader', ->
    chai.expect(n.loader.baseDir).to.equal g.baseDir
  it 'should have an uptime', ->
    chai.expect(n.uptime()).to.be.above 0

  describe 'with new node', ->
    it 'should contain the node', (done) ->
      g.once 'addNode', ->
        setTimeout ->
          chai.expect(n.processes).not.to.be.empty
          chai.expect(n.processes.Split).to.exist
          done()
        , 10
      g.addNode 'Split', 'Split'
    it 'should not contain the node after removal', (done) ->
      g.once 'removeNode', ->
        setTimeout ->
          chai.expect(n.processes).to.be.empty
          done()
        , 10
      g.removeNode 'Split'
