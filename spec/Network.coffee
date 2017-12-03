if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  noflo = require 'noflo'
  root = 'noflo'

describe 'NoFlo Network', ->
  Split = ->
    new noflo.Component
      inPorts:
        in: datatype: 'all'
      outPorts:
        out: datatype: 'all'
      process: (input, output) ->
        output.sendDone
          out: input.get 'in'
  Merge = ->
    new noflo.Component
      inPorts:
        in: datatype: 'all'
      outPorts:
        out: datatype: 'all'
      process: (input, output) ->
        output.sendDone
          out: input.get 'in'
  Callback = ->
    new noflo.Component
      inPorts:
        in: datatype: 'all'
        callback:
          datatype: 'all'
          control: true
      process: (input, output) ->
        # Drop brackets
        return unless input.hasData 'callback', 'in'
        cb = input.getData 'callback'
        data = input.getData 'in'
        cb data
        output.done()

  describe 'with an empty graph', ->
    g = null
    n = null
    before (done) ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      n.connect done
    it 'should initially be marked as stopped', ->
      chai.expect(n.isStarted()).to.equal false
    it 'should initially have no processes', ->
      chai.expect(n.processes).to.be.empty
    it 'should initially have no active processes', ->
      chai.expect(n.getActiveProcesses()).to.eql []
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
    it 'should be able to list components', (done) ->
      @timeout 60 * 1000
      n.loader.listComponents (err, components) ->
        return done err if err
        chai.expect(components).to.be.an 'object'
        done()
      return
    it 'should have an uptime', ->
      chai.expect(n.uptime()).to.be.at.least 0

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
        chai.expect(n.processes.Graph.component.metadata).to.be.an 'object'
        chai.expect(n.processes.Graph.component.metadata).to.eql g.getNode('Graph').metadata
      it 'adding the same node again should be a no-op', (done) ->
        originalProcess = n.getNode 'Graph'
        graphNode = g.getNode 'Graph'
        n.addNode graphNode, (err, newProcess) ->
          return done err if err
          chai.expect(newProcess).to.equal originalProcess
          done()
      it 'should not contain the node after removal', (done) ->
        g.once 'removeNode', ->
          setTimeout ->
            chai.expect(n.processes).to.be.empty
            done()
          , 10
        g.removeNode 'Graph'
      it 'should fail when removing the removed node again', (done) ->
        n.removeNode
          id: 'Graph'
        , (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.contain 'not found'
          done()
    describe 'with new edge', ->
      before ->
        n.loader.components.Split = Split
        g.addNode 'A', 'Split'
        g.addNode 'B', 'Split'
      after ->
        g.removeNode 'A'
        g.removeNode 'B'
      it 'should contain the edge', (done) ->
        g.once 'addEdge', ->
          setTimeout ->
            chai.expect(n.connections).not.to.be.empty
            chai.expect(n.connections[0].from).to.eql
              process: n.getNode 'A'
              port: 'out'
              index: undefined
            chai.expect(n.connections[0].to).to.eql
              process: n.getNode 'B'
              port: 'in'
              index: undefined
            done()
          , 10
        g.addEdge 'A', 'out', 'B', 'in'
      it 'should not contain the edge after removal', (done) ->
        g.once 'removeEdge', ->
          setTimeout ->
            chai.expect(n.connections).to.be.empty
            done()
          , 10
        g.removeEdge 'A', 'out', 'B', 'in'

  describe 'with a simple graph', ->
    g = null
    n = null
    cb = null
    before (done) ->
      @timeout 60 * 1000
      g = new noflo.Graph
      g.baseDir = root
      g.addNode 'Merge', 'Merge'
      g.addNode 'Callback', 'Callback'
      g.addEdge 'Merge', 'out', 'Callback', 'in'
      g.addInitial (data) ->
        chai.expect(data).to.equal 'Foo'
        cb()
      , 'Callback', 'callback'
      g.addInitial 'Foo', 'Merge', 'in'
      noflo.createNetwork g, (err, nw) ->
        return done err if err
        nw.loader.components.Split = Split
        nw.loader.components.Merge = Merge
        nw.loader.components.Callback = Callback
        n = nw
        nw.connect (err) ->
          return done err if err
          done()
      , true

    it 'should send some initials when started', (done) ->
      chai.expect(n.initials).not.to.be.empty
      cb = done
      n.start (err) ->
        return done err if err

    it 'should contain two processes', ->
      chai.expect(n.processes).to.not.be.empty
      chai.expect(n.processes.Merge).to.exist
      chai.expect(n.processes.Merge).to.be.an 'Object'
      chai.expect(n.processes.Callback).to.exist
      chai.expect(n.processes.Callback).to.be.an 'Object'
    it 'the ports of the processes should know the node names', ->
      for name, port of n.processes.Callback.component.inPorts.ports
        chai.expect(port.name).to.equal name
        chai.expect(port.node).to.equal 'Callback'
        chai.expect(port.getId()).to.equal "Callback #{name.toUpperCase()}"
      for name, port of n.processes.Callback.component.outPorts.ports
        chai.expect(port.name).to.equal name
        chai.expect(port.node).to.equal 'Callback'
        chai.expect(port.getId()).to.equal "Callback #{name.toUpperCase()}"

    it 'should contain 1 connection between processes and 2 for IIPs', ->
      chai.expect(n.connections).to.not.be.empty
      chai.expect(n.connections.length).to.equal 3

    it 'should have started in debug mode', ->
      chai.expect(n.debug).to.equal true
      chai.expect(n.getDebug()).to.equal true

    it 'should emit a process-error when a component throws', (done) ->
      g.removeInitial 'Callback', 'callback'
      g.removeInitial 'Merge', 'in'
      g.addInitial (data) ->
        throw new Error 'got Foo'
      , 'Callback', 'callback'
      g.addInitial 'Foo', 'Merge', 'in'
      n.once 'process-error', (err) ->
        chai.expect(err).to.be.an 'object'
        chai.expect(err.id).to.equal 'Callback'
        chai.expect(err.metadata).to.be.an 'object'
        chai.expect(err.error).to.be.an 'error'
        chai.expect(err.error.message).to.equal 'got Foo'
        done()
      n.sendInitials()

    describe 'with a renamed node', ->
      it 'should have the process in a new location', (done) ->
        g.once 'renameNode', ->
          chai.expect(n.processes.Func).to.be.an 'object'
          done()
        g.renameNode 'Callback', 'Func'
      it 'shouldn\'t have the process in the old location', ->
        chai.expect(n.processes.Callback).to.be.undefined
      it 'should fail to rename with the old name', (done) ->
        n.renameNode 'Callback', 'Func', (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.contain 'not found'
          done()
      it 'should have informed the ports of their new node name', ->
        for name, port of n.processes.Func.component.inPorts.ports
          chai.expect(port.name).to.equal name
          chai.expect(port.node).to.equal 'Func'
          chai.expect(port.getId()).to.equal "Func #{name.toUpperCase()}"
        for name, port of n.processes.Func.component.outPorts.ports
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

    describe 'once stopped', ->
      it 'should be marked as stopped', (done) ->
        n.stop ->
          chai.expect(n.isStarted()).to.equal false
          done()

    describe 'without the delay option', ->
      it 'should auto-start', (done) ->
        newGraph = noflo.graph.loadJSON g.toJSON(), (err, graph) ->
          return done err if err
          cb = done
          # Pass the already-initialized component loader
          graph.componentLoader = n.loader
          graph.removeInitial 'Func', 'callback'
          graph.addInitial (data) ->
            chai.expect(data).to.equal 'Foo'
            cb()
          , 'Func', 'callback'
          noflo.createNetwork graph, (err, nw) ->
            return done err if err
          return

  describe 'with nodes containing default ports', ->
    g = null
    testCallback = null
    c = null
    cb = null

    beforeEach ->
      testCallback = null
      c = null
      cb = null

      c = new noflo.Component
      c.inPorts.add 'in',
        required: true
        datatype: 'string'
        default: 'default-value',
      c.outPorts.add 'out'
      c.process (input, output) ->
        output.sendDone input.get 'in'

      cb = new noflo.Component
      cb.inPorts.add 'in',
        required: true
        datatype: 'all'
      cb.process (input, output) ->
        return unless input.hasData 'in'
        testCallback input.getData 'in'

      g = new noflo.Graph
      g.baseDir = root
      g.addNode 'Def', 'Def'
      g.addNode 'Cb', 'Cb'
      g.addEdge 'Def', 'out', 'Cb', 'in'

    it 'should send default values to nodes without an edge', (done) ->
      @timeout 60 * 1000
      testCallback = (data) ->
        chai.expect(data).to.equal 'default-value'
        done()
      noflo.createNetwork g, (err, nw) ->
        return done err if err
        nw.loader.components.Def = -> c
        nw.loader.components.Cb = -> cb
        nw.connect (err) ->
          return done err if err
          nw.start (err) ->
            return done err if err
      , true

    it 'should not send default values to nodes with an edge', (done) ->
      @timeout 60 * 1000
      testCallback = (data) ->
        chai.expect(data).to.equal 'from-edge'
        done()
      g.addNode 'Merge', 'Merge'
      g.addEdge 'Merge', 'out', 'Def', 'in'
      g.addInitial 'from-edge', 'Merge', 'in'
      noflo.createNetwork g, (err, nw) ->
        return done err if err
        nw.loader.components.Def = -> c
        nw.loader.components.Cb = -> cb
        nw.loader.components.Merge = Merge
        nw.connect (err) ->
          return done err if err
          nw.start (err) ->
            return done err if err
      , true

    it 'should not send default values to nodes with IIP', (done) ->
      @timeout 60 * 1000
      testCallback = (data) ->
        chai.expect(data).to.equal 'from-IIP'
        done()
      g.addInitial 'from-IIP', 'Def', 'in'
      noflo.createNetwork g, (err, nw) ->
        return done err if err
        nw.loader.components.Def = -> c
        nw.loader.components.Cb = -> cb
        nw.loader.components.Merge = Merge
        nw.connect (err) ->
          return done err if err
          nw.start (err) ->
            return done err if err
      , true

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
      @timeout 6000

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
      noflo.createNetwork g, (err, nw) ->
        return done err if err
        nw.loader.components.Split = Split
        nw.loader.components.Merge = Merge
        nw.loader.components.Callback = Callback
        n = nw
        nw.connect (err) ->
          return done err if err
          nw.start done
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
      @timeout 6000
      cb = (packet) ->
        chai.expect(packet).to.equal 'Foo'
        done()
      g.addInitial cb, 'Callback', 'callback'
      g.addInitial 'Foo', 'Repeat', 'in'
      setTimeout ->
        noflo.createNetwork g, (err, nw) ->
          return done err if err
          nw.loader.components.Split = Split
          nw.loader.components.Merge = Merge
          nw.loader.components.Callback = Callback
          n = nw
          nw.connect (err) ->
            return done err if err
            nw.start (err) ->
              return done err if err
        , true
      , 10
    it 'should allow removing the IIPs', (done) ->
      @timeout 6000
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
      n.start (err) ->
        return done err if err

    describe 'on stopping', ->
      it 'processes should be running before the stop call', ->
        chai.expect(n.started).to.be.true
        chai.expect(n.processes.Repeat.component.started).to.equal true
      it 'should emit the end event', (done) ->
        @timeout 5000
        # Ensure we have a connection open
        n.once 'end', (endTimes) ->
          chai.expect(endTimes).to.be.an 'object'
          done()
        n.stop (err) ->
          return done err if err
      it 'should have called the shutdown method of each process', ->
        chai.expect(n.processes.Repeat.component.started).to.equal false

  describe 'with a very large network', ->
    it 'should be able to connect without errors', (done) ->
      @timeout 100000
      g = new noflo.Graph
      g.baseDir = root
      called = 0
      for n in [0..10000]
        g.addNode "Repeat#{n}", 'Split'
      g.addNode 'Callback', 'Callback'
      for n in [0..10000]
        g.addEdge "Repeat#{n}", 'out', 'Callback', 'in'
      g.addInitial ->
        called++
      , 'Callback', 'callback'
      for n in [0..10000]
        g.addInitial n, "Repeat#{n}", 'in'

      nw = new noflo.Network g
      nw.loader.listComponents (err) ->
        return done err if err
        nw.loader.components.Split = Split
        nw.loader.components.Callback = Callback
        nw.once 'end', ->
          chai.expect(called).to.equal 10001
          done()
        nw.connect (err) ->
          return done err if err
          nw.start (err) ->
            return done err if err
      return

  describe 'with a faulty graph', ->
    loader = null
    before (done) ->
      loader = new noflo.ComponentLoader root
      loader.listComponents (err) ->
        return done err if err
        loader.components.Split = Split
        done()
    it 'should fail on connect with non-existing component', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Baz'
      g.addNode 'Repeat2', 'Split'
      g.addEdge 'Repeat1', 'out', 'Repeat2', 'in'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'not available'
        done()
    it 'should fail on connect with missing target port', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      g.addNode 'Repeat2', 'Split'
      g.addEdge 'Repeat1', 'out', 'Repeat2', 'foo'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'No inport'
        done()
    it 'should fail on connect with missing source port', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      g.addNode 'Repeat2', 'Split'
      g.addEdge 'Repeat1', 'foo', 'Repeat2', 'in'
      nw = new noflo.Network g
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'No outport'
        done()
    it 'should fail on connect with missing IIP target port', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      g.addNode 'Repeat2', 'Split'
      g.addEdge 'Repeat1', 'out', 'Repeat2', 'in'
      g.addInitial 'hello', 'Repeat1', 'baz'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'No inport'
        done()
    it 'should fail on connect with node without component', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      g.addNode 'Repeat2'
      g.addEdge 'Repeat1', 'out', 'Repeat2', 'in'
      g.addInitial 'hello', 'Repeat1', 'in'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain 'No component defined'
        done()
    it 'should fail to add an edge to a missing outbound node', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        return done err if err
        nw.addEdge {
          from:
            node: 'Repeat2'
            port: 'out'
          to:
            node: 'Repeat1'
            port: 'in'
        }, (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.contain 'No process defined for outbound node'
          done()
    it 'should fail to add an edge to a missing inbound node', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        return done err if err
        nw.addEdge {
          from:
            node: 'Repeat1'
            port: 'out'
          to:
            node: 'Repeat2'
            port: 'in'
        }, (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.contain 'No process defined for inbound node'
          done()
  describe 'baseDir setting', ->
    it 'should set baseDir based on given graph', ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      chai.expect(n.baseDir).to.equal root
    it 'should fall back to CWD if graph has no baseDir', ->
      return @skip() if noflo.isBrowser()
      g = new noflo.Graph
      n = new noflo.Network g
      chai.expect(n.baseDir).to.equal process.cwd()
    it 'should set the baseDir for the component loader', ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      chai.expect(n.baseDir).to.equal root
      chai.expect(n.loader.baseDir).to.equal root
  describe 'debug setting', ->
    n = null
    g = null
    before (done) ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      n.loader.listComponents (err, components) ->
        return done err if err
        n.loader.components.Split = Split
        g.addNode 'A', 'Split'
        g.addNode 'B', 'Split'
        g.addEdge 'A', 'out', 'B', 'in'
        n.connect done
    it 'should initially have debug enabled', ->
      chai.expect(n.getDebug()).to.equal true
    it 'should have propagated debug setting to connections', ->
      chai.expect(n.connections[0].debug).to.equal n.getDebug()
    it 'calling setDebug with same value should be no-op', ->
      n.setDebug true
      chai.expect(n.getDebug()).to.equal true
      chai.expect(n.connections[0].debug).to.equal n.getDebug()
    it 'disabling debug should get propagated to connections', ->
      n.setDebug false
      chai.expect(n.getDebug()).to.equal false
      chai.expect(n.connections[0].debug).to.equal n.getDebug()
