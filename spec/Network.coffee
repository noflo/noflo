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

describe "Nodes are added first, then edges, then initializers (i.e. IIPs), and in order of definition order within each", ->
  g = null
  n = null
  stubbed = {}
  actual = []
  expected = []

  # Poor man's way of stubbing the Network. Investigate using
  # [sinon-chai](https://github.com/domenic/sinon-chai) when we need stubbing
  # for other parts of testing as well.
  stub = ->
    stubbed.addNode = noflo.Network::addNode
    stubbed.addEdge = noflo.Network::addEdge
    stubbed.addInitial = noflo.Network::addInitial

    # Record the node/edge/initial and pass it along
    noflo.Network::addNode = (node, cb) ->
      actual.push node
      stubbed.addNode.call this, node, cb
    noflo.Network::addEdge = (edge, cb) ->
      actual.push edge
      stubbed.addEdge.call this, edge, cb
    noflo.Network::addInitial = (initial, cb) ->
      actual.push initial
      stubbed.addInitial.call this, initial, cb

  # Clean up after ourselves
  restore = ->
    noflo.Network::addNode = stubbed.addNode
    noflo.Network::addEdge = stubbed.addEdge
    noflo.Network::addInitial = stubbed.addInitial

  before (done) ->
    stub()

    g = new noflo.Graph
    g.baseDir = root
    # Save the nodes/edges/initial for order testing later. The index numbers
    # are the expected positions.
    expected[0] = g.addNode "D", "Callback"
    expected[10] = g.addInitial (->), "D", "callback"
    expected[1] = g.addNode "A", "Split"
    expected[11] = g.addInitial "Hello", "A", "in"
    expected[2] = g.addNode "B1", "Merge"
    expected[5] = g.addEdge "A", "out", "B1", "in"
    expected[6] = g.addEdge "A", "out", "B2", "in"
    expected[3] = g.addNode "B2", "Merge"
    expected[4] = g.addNode "C", "Merge"
    expected[7] = g.addEdge "B1", "out", "C", "in"
    expected[12] = g.addInitial "World", "C", "in"
    expected[8] = g.addEdge "B2", "out", "C", "in"
    expected[9] = g.addEdge "C", "out", "D", "in"
    noflo.createNetwork g, (nw) ->
      n = nw
      done()

  after restore

  it "should add nodes, edges, and initials, in that order", ->
    chai.expect(actual).to.deep.equal expected
