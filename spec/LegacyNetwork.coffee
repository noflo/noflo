if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  noflo = require 'noflo'
  root = 'noflo'

describe 'NoFlo Legacy Network', ->
  Split = ->
    return new noflo.Component
      inPorts:
        in: datatype: 'all'
      outPorts:
        out: datatype: 'all'
      process: (input, output) ->
        output.sendDone
          out: input.get 'in'
        return
  Merge = ->
    return new noflo.Component
      inPorts:
        in: datatype: 'all'
      outPorts:
        out: datatype: 'all'
      process: (input, output) ->
        output.sendDone
          out: input.get 'in'
        return
  Callback = ->
    return new noflo.Component
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
        return
  describe 'with an empty graph', ->
    g = null
    n = null
    before (done) ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      n.connect done
      return
    it 'should initially be marked as stopped', ->
      chai.expect(n.isStarted()).to.equal false
      return
    it 'should initially have no processes', ->
      chai.expect(n.processes).to.be.empty
      return
    it 'should initially have no active processes', ->
      chai.expect(n.getActiveProcesses()).to.eql []
      return
    it 'should initially have to connections', ->
      chai.expect(n.connections).to.be.empty
      return
    it 'should initially have no IIPs', ->
      chai.expect(n.initials).to.be.empty
      return
    it 'should have reference to the graph', ->
      chai.expect(n.graph).to.equal g
      return
    it 'should know its baseDir', ->
      chai.expect(n.baseDir).to.equal g.baseDir
      return
    it 'should have a ComponentLoader', ->
      chai.expect(n.loader).to.be.an 'object'
      return
    it 'should have transmitted the baseDir to the Component Loader', ->
      chai.expect(n.loader.baseDir).to.equal g.baseDir
      return
    it 'should be able to list components', (done) ->
      @timeout 60 * 1000
      n.loader.listComponents (err, components) ->
        if err
          done err
          return
        chai.expect(components).to.be.an 'object'
        done()
        return
      return
    it 'should have an uptime', ->
      chai.expect(n.uptime()).to.be.at.least 0

      return
    describe 'with new node', ->
      it 'should contain the node', (done) ->
        g.once 'addNode', ->
          setTimeout ->
            chai.expect(n.processes).not.to.be.empty
            chai.expect(n.processes.Graph).to.exist
            done()
            return
          , 10
          return
        g.addNode 'Graph', 'Graph',
          foo: 'Bar'
        return
      it 'should have transmitted the node metadata to the process', ->
        chai.expect(n.processes.Graph.component.metadata).to.exist
        chai.expect(n.processes.Graph.component.metadata).to.be.an 'object'
        chai.expect(n.processes.Graph.component.metadata).to.eql g.getNode('Graph').metadata
        return
      it 'adding the same node again should be a no-op', (done) ->
        originalProcess = n.getNode 'Graph'
        graphNode = g.getNode 'Graph'
        n.addNode graphNode, (err, newProcess) ->
          if err
            done err
            return
          chai.expect(newProcess).to.equal originalProcess
          done()
          return
        return
      it 'should not contain the node after removal', (done) ->
        g.once 'removeNode', ->
          setTimeout ->
            chai.expect(n.processes).to.be.empty
            done()
            return
          , 10
          return
        g.removeNode 'Graph'
        return
      it 'should fail when removing the removed node again', (done) ->
        n.removeNode
          id: 'Graph'
        , (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.contain 'not found'
          done()
          return
        return
      return
    describe 'with new edge', ->
      before ->
        n.loader.components.Split = Split
        g.addNode 'A', 'Split'
        g.addNode 'B', 'Split'
        return
      after ->
        g.removeNode 'A'
        g.removeNode 'B'
        return
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
            return
          , 10
          return
        g.addEdge 'A', 'out', 'B', 'in'
        return
      it 'should not contain the edge after removal', (done) ->
        g.once 'removeEdge', ->
          setTimeout ->
            chai.expect(n.connections).to.be.empty
            done()
            return
          , 10
          return
        g.removeEdge 'A', 'out', 'B', 'in'
        return
      return
    return
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
        return
      , 'Callback', 'callback'
      g.addInitial 'Foo', 'Merge', 'in'
      noflo.createNetwork g, (err, nw) ->
        if err
          done err
          return
        nw.loader.components.Split = Split
        nw.loader.components.Merge = Merge
        nw.loader.components.Callback = Callback
        n = nw
        nw.connect (err) ->
          if err
            done err
            return
          done()
          return
        return
      , true
      return
    it 'should send some initials when started', (done) ->
      chai.expect(n.initials).not.to.be.empty
      cb = done
      n.start (err) ->
        if err
          done err
          return
        return
      return
    it 'should contain two processes', ->
      chai.expect(n.processes).to.not.be.empty
      chai.expect(n.processes.Merge).to.exist
      chai.expect(n.processes.Merge).to.be.an 'Object'
      chai.expect(n.processes.Callback).to.exist
      chai.expect(n.processes.Callback).to.be.an 'Object'
      return
    it 'the ports of the processes should know the node names', ->
      for name, port of n.processes.Callback.component.inPorts.ports
        chai.expect(port.name).to.equal name
        chai.expect(port.node).to.equal 'Callback'
        chai.expect(port.getId()).to.equal "Callback #{name.toUpperCase()}"
      for name, port of n.processes.Callback.component.outPorts.ports
        chai.expect(port.name).to.equal name
        chai.expect(port.node).to.equal 'Callback'
        chai.expect(port.getId()).to.equal "Callback #{name.toUpperCase()}"

      return
    it 'should contain 1 connection between processes and 2 for IIPs', ->
      chai.expect(n.connections).to.not.be.empty
      chai.expect(n.connections.length).to.equal 3

      return
    it 'should have started in debug mode', ->
      chai.expect(n.debug).to.equal true
      chai.expect(n.getDebug()).to.equal true

      return
    it 'should emit a process-error when a component throws', (done) ->
      g.removeInitial 'Callback', 'callback'
      g.removeInitial 'Merge', 'in'
      g.addInitial (data) ->
        throw new Error 'got Foo'
        return
      , 'Callback', 'callback'
      g.addInitial 'Foo', 'Merge', 'in'
      n.once 'process-error', (err) ->
        chai.expect(err).to.be.an 'object'
        chai.expect(err.id).to.equal 'Callback'
        chai.expect(err.metadata).to.be.an 'object'
        chai.expect(err.error).to.be.an 'error'
        chai.expect(err.error.message).to.equal 'got Foo'
        done()
        return
      n.sendInitials()

      return
    describe 'with a renamed node', ->
      it 'should have the process in a new location', (done) ->
        g.once 'renameNode', ->
          chai.expect(n.processes.Func).to.be.an 'object'
          done()
          return
        g.renameNode 'Callback', 'Func'
        return
      it 'shouldn\'t have the process in the old location', ->
        chai.expect(n.processes.Callback).to.be.undefined
        return
      it 'should fail to rename with the old name', (done) ->
        n.renameNode 'Callback', 'Func', (err) ->
          chai.expect(err).to.be.an 'error'
          chai.expect(err.message).to.contain 'not found'
          done()
          return
        return
      it 'should have informed the ports of their new node name', ->
        for name, port of n.processes.Func.component.inPorts.ports
          chai.expect(port.name).to.equal name
          chai.expect(port.node).to.equal 'Func'
          chai.expect(port.getId()).to.equal "Func #{name.toUpperCase()}"
        for name, port of n.processes.Func.component.outPorts.ports
          chai.expect(port.name).to.equal name
          chai.expect(port.node).to.equal 'Func'
          chai.expect(port.getId()).to.equal "Func #{name.toUpperCase()}"
        return
      return
    describe 'with process icon change', ->
      it 'should emit an icon event', (done) ->
        n.once 'icon', (data) ->
          chai.expect(data).to.be.an 'object'
          chai.expect(data.id).to.equal 'Func'
          chai.expect(data.icon).to.equal 'flask'
          done()
          return
        n.processes.Func.component.setIcon 'flask'
        return
      return
    describe 'once stopped', ->
      it 'should be marked as stopped', (done) ->
        n.stop ->
          chai.expect(n.isStarted()).to.equal false
          done()
          return
        return
      return
    describe 'without the delay option', ->
      it 'should auto-start', (done) ->
        g.removeInitial 'Func', 'callback'
        newGraph = noflo.graph.loadJSON g.toJSON(), (err, graph) ->
          if err
            done err
            return
          cb = done
          # Pass the already-initialized component loader
          graph.componentLoader = n.loader
          graph.addInitial (data) ->
            chai.expect(data).to.equal 'Foo'
            cb()
            return
          , 'Func', 'callback'
          noflo.createNetwork graph, (err, nw) ->
            if err
              done err
              return
            return
          return
        return
      return
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
        return
      cb = new noflo.Component
      cb.inPorts.add 'in',
        required: true
        datatype: 'all'
      cb.process (input, output) ->
        return unless input.hasData 'in'
        testCallback input.getData 'in'
        return
      g = new noflo.Graph
      g.baseDir = root
      g.addNode 'Def', 'Def'
      g.addNode 'Cb', 'Cb'
      g.addEdge 'Def', 'out', 'Cb', 'in'

      return
    it 'should send default values to nodes without an edge', (done) ->
      @timeout 60 * 1000
      testCallback = (data) ->
        chai.expect(data).to.equal 'default-value'
        done()
        return
      noflo.createNetwork g, (err, nw) ->
        if err
          done err
          return
        nw.loader.components.Def = -> c
        nw.loader.components.Cb = -> cb
        nw.connect (err) ->
          if err
            done err
            return
          nw.start (err) ->
            if err
              done err
              return
            return
          return
        return
      , true

      return
    it 'should not send default values to nodes with an edge', (done) ->
      @timeout 60 * 1000
      testCallback = (data) ->
        chai.expect(data).to.equal 'from-edge'
        done()
        return
      g.addNode 'Merge', 'Merge'
      g.addEdge 'Merge', 'out', 'Def', 'in'
      g.addInitial 'from-edge', 'Merge', 'in'
      noflo.createNetwork g, (err, nw) ->
        if err
          done err
          return
        nw.loader.components.Def = -> c
        nw.loader.components.Cb = -> cb
        nw.loader.components.Merge = Merge
        nw.connect (err) ->
          if err
            done err
            return
          nw.start (err) ->
            if err
              done err
              return
            return
          return
        return
      , true

      return
    it 'should not send default values to nodes with IIP', (done) ->
      @timeout 60 * 1000
      testCallback = (data) ->
        chai.expect(data).to.equal 'from-IIP'
        done()
        return
      g.addInitial 'from-IIP', 'Def', 'in'
      noflo.createNetwork g, (err, nw) ->
        if err
          done err
          return
        nw.loader.components.Def = -> c
        nw.loader.components.Cb = -> cb
        nw.loader.components.Merge = Merge
        nw.connect (err) ->
          if err
            done err
            return
          nw.start (err) ->
            if err
              done err
              return
            return
          return
        return
      , true
      return
    return
  describe 'with an existing IIP', ->
    g = null
    n = null
    before ->
      g = new noflo.Graph
      g.baseDir = root
      g.addNode 'Callback', 'Callback'
      g.addNode 'Repeat', 'Split'
      g.addEdge 'Repeat', 'out', 'Callback', 'in'
      return
    it 'should call the Callback with the original IIP value', (done) ->
      @timeout 6000
      cb = (packet) ->
        chai.expect(packet).to.equal 'Foo'
        done()
        return
      g.addInitial cb, 'Callback', 'callback'
      g.addInitial 'Foo', 'Repeat', 'in'
      setTimeout ->
        noflo.createNetwork g, (err, nw) ->
          if err
            done err
            return
          nw.loader.components.Split = Split
          nw.loader.components.Merge = Merge
          nw.loader.components.Callback = Callback
          n = nw
          nw.connect (err) ->
            if err
              done err
              return
            nw.start (err) ->
              if err
                done err
                return
              return
            return
          return
        , true
        return
      , 10
      return
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
        return
      g.on 'removeInitial', onRemove
      g.removeInitial 'Callback', 'callback'
      g.removeInitial 'Repeat', 'in'
      return
    it 'new IIPs to replace original ones should work correctly', (done) ->
      cb = (packet) ->
        chai.expect(packet).to.equal 'Baz'
        done()
        return
      g.addInitial cb, 'Callback', 'callback'
      g.addInitial 'Baz', 'Repeat', 'in'
      n.start (err) ->
        if err
          done err
          return
        return
      return
    describe 'on stopping', ->
      it 'processes should be running before the stop call', ->
        chai.expect(n.started).to.be.true
        chai.expect(n.processes.Repeat.component.started).to.equal true
        return
      it 'should emit the end event', (done) ->
        @timeout 5000
        # Ensure we have a connection open
        n.once 'end', (endTimes) ->
          chai.expect(endTimes).to.be.an 'object'
          done()
          return
        n.stop (err) ->
          if err
            done err
            return
          return
        return
      it 'should have called the shutdown method of each process', ->
        chai.expect(n.processes.Repeat.component.started).to.equal false
        return
      return
    return
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
        return
      , 'Callback', 'callback'
      for n in [0..10000]
        g.addInitial n, "Repeat#{n}", 'in'

      nw = new noflo.Network g
      nw.loader.listComponents (err) ->
        if err
          done err
          return
        nw.loader.components.Split = Split
        nw.loader.components.Callback = Callback
        nw.once 'end', ->
          chai.expect(called).to.equal 10001
          done()
          return
        nw.connect (err) ->
          if err
            done err
            return
          nw.start (err) ->
            if err
              done err
              return
            return
          return
        return
      return
    return

  describe 'with a faulty graph', ->
    loader = null
    before (done) ->
      loader = new noflo.ComponentLoader root
      loader.listComponents (err) ->
        if err
          done err
          return
        loader.components.Split = Split
        done()
        return
      return
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
        return
      return
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
        return
      return
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
        return
      return
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
        return
      return
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
        return
      return
    it 'should fail to add an edge to a missing outbound node', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        if err
          done err
          return
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
          return
        return
      return
    it 'should fail to add an edge to a missing inbound node', (done) ->
      g = new noflo.Graph
      g.addNode 'Repeat1', 'Split'
      nw = new noflo.Network g
      nw.loader = loader
      nw.connect (err) ->
        if err
          done err
          return
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
          return
        return
      return
    return
  describe 'baseDir setting', ->
    it 'should set baseDir based on given graph', ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      chai.expect(n.baseDir).to.equal root
      return
    it 'should fall back to CWD if graph has no baseDir', ->
      if noflo.isBrowser()
        @skip()
        return
      g = new noflo.Graph
      n = new noflo.Network g
      chai.expect(n.baseDir).to.equal process.cwd()
      return
    it 'should set the baseDir for the component loader', ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      chai.expect(n.baseDir).to.equal root
      chai.expect(n.loader.baseDir).to.equal root
      return
    return
  describe 'debug setting', ->
    n = null
    g = null
    before (done) ->
      g = new noflo.Graph
      g.baseDir = root
      n = new noflo.Network g
      n.loader.listComponents (err, components) ->
        if err
          done err
          return
        n.loader.components.Split = Split
        g.addNode 'A', 'Split'
        g.addNode 'B', 'Split'
        g.addEdge 'A', 'out', 'B', 'in'
        n.connect done
        return
      return
    it 'should initially have debug enabled', ->
      chai.expect(n.getDebug()).to.equal true
      return
    it 'should have propagated debug setting to connections', ->
      chai.expect(n.connections[0].debug).to.equal n.getDebug()
      return
    it 'calling setDebug with same value should be no-op', ->
      n.setDebug true
      chai.expect(n.getDebug()).to.equal true
      chai.expect(n.connections[0].debug).to.equal n.getDebug()
      return
    it 'disabling debug should get propagated to connections', ->
      n.setDebug false
      chai.expect(n.getDebug()).to.equal false
      chai.expect(n.connections[0].debug).to.equal n.getDebug()
      return
    return
  return
