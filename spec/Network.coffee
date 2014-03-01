if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  noflo = require 'noflo/src/lib/NoFlo.js'
  root = 'noflo'

describe 'NoFlo Network', ->
  class Split extends noflo.Component
    constructor: ->
      @stopped = false
      @inPorts =
        in: new noflo.Port
      @outPorts =
        out: new noflo.ArrayPort
      @inPorts.in.on 'data', (data) =>
        @outPorts.out.send data
      @inPorts.in.on 'disconnect', =>
        @outPorts.out.disconnect()
    shutdown: ->
      @stopped = true
  Split.getComponent = -> new Split
  class Merge extends noflo.Component
    constructor: ->
      @inPorts =
        in: new noflo.ArrayPort
      @outPorts =
        out: new noflo.Port
      @inPorts.in.on 'data', (data) =>
        @outPorts.out.send data
      @inPorts.in.on 'disconnect', =>
        @outPorts.out.disconnect()
  Merge.getComponent = -> new Merge
  class Callback extends noflo.Component
    constructor: ->
      @cb = null
      @inPorts =
        in: new noflo.Port
        callback: new noflo.Port
      @outPorts = {}
      @inPorts.callback.on 'data', (data) =>
        @cb = data
      @inPorts.in.on 'data', (data) =>
        @cb data
  Callback.getComponent = -> new Callback

  describe 'with an empty graph', ->
    g = null
    n = null
    before (done) ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      n.connect done
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
            chai.expect(n.processes.Graph).to.exist
            done()
          , 10
        g.addNode 'Graph', 'Graph',
          foo: 'Bar'
      it 'should have transmitted the node metadata to the process', ->
        chai.expect(n.processes.Graph.component.metadata).to.exist
        chai.expect(n.processes.Graph.component.metadata).to.be.an.object
        chai.expect(n.processes.Graph.component.metadata).to.eql g.getNode('Graph').metadata
      it 'should not contain the node after removal', (done) ->
        g.once 'removeNode', ->
          setTimeout ->
            chai.expect(n.processes).to.be.empty
            done()
          , 10
        g.removeNode 'Graph'

  describe 'with a simple graph', ->
    g = null
    n = null
    before (done) ->
      g = new noflo.Graph
      g.baseDir = root
      g.addNode 'Merge', 'Merge'
      g.addNode 'Callback', 'Callback'
      g.addEdge 'Merge', 'out', 'Callback', 'in'
      noflo.createNetwork g, (nw) ->
        nw.loader.components.Split = Split
        nw.loader.components.Merge = Merge
        nw.loader.components.Callback = Callback
        n = nw
        nw.connect ->
          nw.start()
          done()
      , true

    it 'should contain two processes', ->
      chai.expect(n.processes).to.not.be.empty
      chai.expect(n.processes.Merge).to.exist
      chai.expect(n.processes.Merge).to.be.an 'Object'
      chai.expect(n.processes.Callback).to.exist
      chai.expect(n.processes.Callback).to.be.an 'Object'
    it 'the ports of the processes should know the node names', ->
      for name, port of n.processes.Callback.component.inPorts
        chai.expect(port.name).to.equal name
        chai.expect(port.node).to.equal 'Callback'
        chai.expect(port.getId()).to.equal "Callback #{name.toUpperCase()}"
      for name, port of n.processes.Callback.component.outPorts
        chai.expect(port.name).to.equal name
        chai.expect(port.node).to.equal 'Callback'
        chai.expect(port.getId()).to.equal "Callback #{name.toUpperCase()}"

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
      n.start()

    describe 'with a renamed node', ->
      it 'should have the process in a new location', (done) ->
        g.once 'renameNode', ->
          chai.expect(n.processes.Func).to.be.an 'object'
          done()
        g.renameNode 'Callback', 'Func'
      it 'shouldn\'t have the process in the old location', ->
        chai.expect(n.processes.Callback).to.be.undefined
      it 'should have informed the ports of their new node name', ->
        for name, port of n.processes.Func.component.inPorts
          chai.expect(port.name).to.equal name
          chai.expect(port.node).to.equal 'Func'
          chai.expect(port.getId()).to.equal "Func #{name.toUpperCase()}"
        for name, port of n.processes.Func.component.outPorts
          chai.expect(port.name).to.equal name
          chai.expect(port.node).to.equal 'Func'
          chai.expect(port.getId()).to.equal "Func #{name.toUpperCase()}"

    describe 'with process icon change', ->
      it 'should emit an icon event', (done) ->
        n.once 'icon', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.id).to.equal 'Func'
          chai.expect(data.icon).to.equal 'flask'
          done()
        n.processes.Func.component.setIcon 'flask'

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
      expected[3] = g.addNode "B2", "Merge"
      expected[5] = g.addEdge "A", "out", "B1", "in"
      expected[6] = g.addEdge "A", "out", "B2", "in"
      expected[4] = g.addNode "C", "Merge"
      expected[7] = g.addEdge "B1", "out", "C", "in"
      expected[12] = g.addInitial "World", "C", "in"
      expected[8] = g.addEdge "B2", "out", "C", "in"
      expected[9] = g.addEdge "C", "out", "D", "in"
      noflo.createNetwork g, (nw) ->
        nw.loader.components.Split = Split
        nw.loader.components.Merge = Merge
        nw.loader.components.Callback = Callback
        n = nw
        nw.connect ->
          nw.start()
          done()
      , true

    after restore

    it "should add nodes, edges, and initials, in that order", ->
      chai.expect(actual).to.deep.equal expected

  describe 'with an existing IIP', ->
    g = null
    n = null
    before ->
      g = new noflo.Graph
      g.baseDir = root
      g.addNode 'Callback', 'Callback'
      g.addNode 'Repeat', 'Split'
      g.addEdge 'Repeat', 'out', 'Callback', 'in'
    it 'should call the Callback with the original IIP value', (done) ->
      cb = (packet) ->
        chai.expect(packet).to.equal 'Foo'
        done()
      g.addInitial cb, 'Callback', 'callback'
      g.addInitial 'Foo', 'Repeat', 'in'
      setTimeout ->
        noflo.createNetwork g, (nw) ->
          nw.loader.components.Split = Split
          nw.loader.components.Merge = Merge
          nw.loader.components.Callback = Callback
          n = nw
          nw.connect ->
            nw.start()
        , true
      , 10
    it 'should allow removing the IIPs', (done) ->
      removed = 0
      onRemove = ->
        removed++
        return if removed < 2
        chai.expect(n.initials.length).to.equal 0, 'No IIPs left'
        chai.expect(n.connections.length).to.equal 1, 'Only one connection'
        g.removeListener 'removeInitial', onRemove
        done()
      g.on 'removeInitial', onRemove
      g.removeInitial 'Callback', 'callback'
      g.removeInitial 'Repeat', 'in'
    it 'new IIPs to replace original ones should work correctly', (done) ->
      cb = (packet) ->
        chai.expect(packet).to.equal 'Baz'
        done()
      g.addInitial cb, 'Callback', 'callback'
      g.addInitial 'Baz', 'Repeat', 'in'
      n.start()

    describe 'on stopping', ->
      it 'processes should be running before the stop call', ->
        chai.expect(n.processes.Repeat.component.stopped).to.equal false
      it 'should emit the end event', (done) ->
        # Ensure we have a connection open
        n.stop()
        n.once 'end', (endTimes) ->
          chai.expect(endTimes).to.be.an 'object'
          done()
      it 'should have called the shutdown method of each process', ->
        chai.expect(n.processes.Repeat.component.stopped).to.equal true
