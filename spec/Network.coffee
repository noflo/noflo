if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  noflo = require 'noflo/src/lib/NoFlo.js'
  root = 'noflo'

describe 'Network with an empty graph', ->
  g = new noflo.Graph
  g.baseDir = root
  n = new noflo.Network g

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

describe 'Network with a simple graph', ->
  g = null
  n = null
  before (done) ->
    g = new noflo.Graph
    g.baseDir = root
    g.addNode 'Merge', 'Merge'
    g.addNode 'Callback', 'Callback'
    g.addEdge 'Merge', 'out', 'Callback', 'in'
    noflo.createNetwork g, (nw) ->
      n = nw
      done()

  it 'should contain two processes', ->
    chai.expect(n.processes).to.not.be.empty
    chai.expect(n.processes.Merge).to.exist
    chai.expect(n.processes.Merge).to.be.an 'Object'
    chai.expect(n.processes.Callback).to.exist
    chai.expect(n.processes.Callback).to.be.an 'Object'

  it 'should contain one connection', ->
    chai.expect(n.connections).to.not.be.empty
    chai.expect(n.connections.length).to.equal 1

  it 'should call callback when receiving data', (done) ->
    g.addInitial (data) ->
      chai.expect(data).to.equal 'Foo'
      done()
    , 'Callback', 'callback'
    g.addInitial 'Foo', 'Merge', 'in'

    chai.expect(n.initials).not.to.be.empty
    n.sendInitials()
