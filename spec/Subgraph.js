if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo'
  path = require 'path'
  root = path.resolve __dirname, '../'
  urlPrefix = './'
else
  noflo = require 'noflo'
  root = 'noflo'
  urlPrefix = '/'

describe 'NoFlo Graph component', ->
  c = null
  g = null
  loader = null
  before (done) ->
    loader = new noflo.ComponentLoader root
    loader.listComponents done
    return
  beforeEach (done) ->
    loader.load 'Graph', (err, instance) ->
      if err
        done err
        return
      c = instance
      g = noflo.internalSocket.createSocket()
      c.inPorts.graph.attach g
      done()
      return
    return

  Split = ->
    inst = new noflo.Component
    inst.inPorts.add 'in',
      datatype: 'all'
    inst.outPorts.add 'out',
      datatype: 'all'
    inst.process (input, output) ->
      data = input.getData 'in'
      output.sendDone
        out: data
      return
    return inst

  SubgraphMerge = ->
    inst = new noflo.Component
    inst.inPorts.add 'in',
      datatype: 'all'
    inst.outPorts.add 'out',
      datatype: 'all'
    inst.forwardBrackets = {}
    inst.process (input, output) ->
      packet = input.get 'in'
      unless packet.type is 'data'
        output.done()
        return
      output.sendDone
        out: packet.data
      return
    return inst

  describe 'initially', ->
    it 'should be ready', ->
      chai.expect(c.ready).to.be.true
      return
    it 'should not contain a network', ->
      chai.expect(c.network).to.be.null
      return
    it 'should have a baseDir', ->
      chai.expect(c.baseDir).to.equal root
      return
    it 'should only have the graph inport', ->
      chai.expect(c.inPorts.ports).to.have.keys ['graph']
      chai.expect(c.outPorts.ports).to.be.empty
      return
    return
  describe 'with JSON graph definition', ->
    it 'should emit a ready event after network has been loaded', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
        return
      c.once 'network', (network) ->
        network.loader.components.Split = Split
        network.loader.registerComponent '', 'Merge', SubgraphMerge
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.start (err) ->
          done err if err
          return
        return
      g.send
        processes:
          Split:
            component: 'Split'
          Merge:
            component: 'Merge'
      return
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
        ]
        chai.expect(c.outPorts.ports).to.be.empty
        done()
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send
        processes:
          Split:
            component: 'Split'
          Merge:
            component: 'Merge'
        connections: [
          src:
            process: 'Merge'
            port: 'out'
          tgt:
            process: 'Split'
            port: 'in'
        ]
      return
    it 'should update description from the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        chai.expect(c.description).to.equal 'Hello, World!'
        done()
        return
      c.once 'network', (network) ->
        network.loader.components.Split = Split
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        chai.expect(c.description).to.equal 'Hello, World!'
        c.start (err) ->
          done err if err
          return
        return
      g.send
        properties:
          description: 'Hello, World!'
        processes:
          Split:
            component: 'Split'
      return
    it 'should expose only exported ports when they exist', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'out'
        ]
        done()
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send
        outports:
          out:
            process: 'Split'
            port: 'out'
        processes:
          Split:
            component: 'Split'
          Merge:
            component: 'Merge'
        connections: [
          src:
            process: 'Merge'
            port: 'out'
          tgt:
            process: 'Split'
            port: 'in'
        ]
      return
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        ins = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts['in'].attach ins
        c.outPorts['out'].attach out
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          done()
          return
        ins.send 'Foo'
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send
        inports:
          in:
            process: 'Merge'
            port: 'in'
        outports:
          out:
            process: 'Split'
            port: 'out'
        processes:
          Split:
            component: 'Split'
          Merge:
            component: 'Merge'
        connections: [
          src:
            process: 'Merge'
            port: 'out'
          tgt:
            process: 'Split'
            port: 'in'
        ]
      return
    return
  describe 'with a Graph instance', ->
    gr = null
    before ->
      gr = new noflo.Graph 'Hello, world'
      gr.baseDir = root
      gr.addNode 'Split', 'Split'
      gr.addNode 'Merge', 'Merge'
      gr.addEdge 'Merge', 'out', 'Split', 'in'
      gr.addInport 'in', 'Merge', 'in'
      gr.addOutport 'out', 'Split', 'out'
      return
    it 'should emit a ready event after network has been loaded', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send gr
      chai.expect(c.ready).to.be.false
      return
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
          'in'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'out'
        ]
        done()
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send gr
      return
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      doned = false
      c.once 'ready', ->
        ins = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts['in'].attach ins
        c.outPorts['out'].attach out
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Baz'
          if doned
            process.exit 1
          done()
          doned = true
          return
        ins.send 'Baz'
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send gr
      return
    return
  describe 'with a FBP file with INPORTs and OUTPORTs', ->
    file = "#{urlPrefix}spec/fixtures/subgraph.fbp"
    it 'should emit a ready event after network has been loaded', (done) ->
      @timeout 6000
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send file
      chai.expect(c.ready).to.be.false
      return
    it 'should expose available ports', (done) ->
      @timeout 6000
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
          'in'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'out'
        ]
        done()
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send file
      return
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      @timeout 6000
      c.once 'ready', ->
        ins = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts['in'].attach ins
        c.outPorts['out'].attach out
        received = false
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          received = true
          return
        out.on 'disconnect', ->
          chai.expect(received, 'should have transmitted data').to.equal true
          done()
          return
        ins.connect()
        ins.send 'Foo'
        ins.disconnect()
        return
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        c.start (err) ->
          done err if err
          return
        return
      g.send file
      return
    return
  describe 'when a subgraph is used as a component', ->

    createSplit = ->
      c = new noflo.Component
      c.inPorts.add 'in',
        required: true
        datatype: 'string'
        default: 'default-value',
      c.outPorts.add 'out',
        datatype: 'string'
      c.process (input, output) ->
        data = input.getData 'in'
        output.sendDone
          out: data
        return
      return c

    grDefaults = new noflo.Graph 'Child Graph Using Defaults'
    grDefaults.addNode 'SplitIn', 'Split'
    grDefaults.addNode 'SplitOut', 'Split'
    grDefaults.addInport 'in', 'SplitIn', 'in'
    grDefaults.addOutport 'out', 'SplitOut', 'out'
    grDefaults.addEdge 'SplitIn', 'out', 'SplitOut', 'in'

    grInitials = new noflo.Graph 'Child Graph Using Initials'
    grInitials.addNode 'SplitIn', 'Split'
    grInitials.addNode 'SplitOut', 'Split'
    grInitials.addInport 'in', 'SplitIn', 'in'
    grInitials.addOutport 'out', 'SplitOut', 'out'
    grInitials.addInitial 'initial-value', 'SplitIn', 'in'
    grInitials.addEdge 'SplitIn', 'out', 'SplitOut', 'in'

    cl = null
    before (done) ->
      @timeout 6000
      cl = new noflo.ComponentLoader root
      cl.listComponents (err, components) ->
        if err
          done err
          return
        cl.components.Split = createSplit
        cl.components.Defaults = grDefaults
        cl.components.Initials = grInitials
        done()
        return
      return

    it 'should send defaults', (done) ->
      cl.load 'Defaults', (err, inst) ->
        o = noflo.internalSocket.createSocket()
        inst.outPorts.out.attach o
        o.once 'data', (data) ->
          chai.expect(data).to.equal 'default-value'
          done()
          return
        inst.start (err) ->
          if err
            done err
            return
          return
        return
      return

    it 'should send initials', (done) ->
      cl.load 'Initials', (err, inst) ->
        o = noflo.internalSocket.createSocket()
        inst.outPorts.out.attach o
        o.once 'data', (data) ->
          chai.expect(data).to.equal 'initial-value'
          done()
          return
        inst.start (err) ->
          if err
            done err
            return
          return
        return
      return

    it 'should not send defaults when an inport is attached externally', (done) ->
      cl.load 'Defaults', (err, inst) ->
        i = noflo.internalSocket.createSocket()
        o = noflo.internalSocket.createSocket()
        inst.inPorts.in.attach i
        inst.outPorts.out.attach o
        o.once 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          done()
          return
        inst.start (err) ->
          if err
            done err
            return
          return
        i.send 'Foo'
        return
      return

    it 'should deactivate after processing is complete', (done) ->
      cl.load 'Defaults', (err, inst) ->
        i = noflo.internalSocket.createSocket()
        o = noflo.internalSocket.createSocket()
        inst.inPorts.in.attach i
        inst.outPorts.out.attach o
        expected = [
          'ACTIVATE 1'
          'data Foo'
          'DEACTIVATE 0'
        ]
        received = []
        o.on 'ip', (ip) ->
          received.push "#{ip.type} #{ip.data}"
          return
        inst.on 'activate', (load) ->
          received.push "ACTIVATE #{load}"
          return
        inst.on 'deactivate', (load) ->
          received.push "DEACTIVATE #{load}"
          return unless received.length is expected.length
          chai.expect(received).to.eql expected
          done()
          return
        inst.start (err) ->
          if err
            done err
            return
          i.send 'Foo'
          return
        return
      return

    it.skip 'should activate automatically when receiving data', (done) ->
      cl.load 'Defaults', (err, inst) ->
        i = noflo.internalSocket.createSocket()
        o = noflo.internalSocket.createSocket()
        inst.inPorts.in.attach i
        inst.outPorts.out.attach o
        expected = [
          'ACTIVATE 1'
          'data Foo'
          'DEACTIVATE 0'
        ]
        received = []
        o.on 'ip', (ip) ->
          received.push "#{ip.type} #{ip.data}"
        inst.on 'activate', (load) ->
          received.push "ACTIVATE #{load}"
        inst.on 'deactivate', (load) ->
          received.push "DEACTIVATE #{load}"
          return unless received.length is expected.length
          chai.expect(received).to.eql expected
          done()
          return
        i.send 'Foo'
        return
      return

    it 'should reactivate when receiving new data packets', (done) ->
      cl.load 'Defaults', (err, inst) ->
        i = noflo.internalSocket.createSocket()
        o = noflo.internalSocket.createSocket()
        inst.inPorts.in.attach i
        inst.outPorts.out.attach o
        expected = [
          'ACTIVATE 1'
          'data Foo'
          'DEACTIVATE 0'
          'ACTIVATE 1'
          'data Bar'
          'data Baz'
          'DEACTIVATE 0'
          'ACTIVATE 1'
          'data Foobar'
          'DEACTIVATE 0'
        ]
        received = []
        send = [
          ['Foo']
          ['Bar', 'Baz']
          ['Foobar']
        ]
        sendNext = ->
          return unless send.length
          sends = send.shift()
          i.post new noflo.IP 'data', d for d in sends
          return
        o.on 'ip', (ip) ->
          received.push "#{ip.type} #{ip.data}"
          return
        inst.on 'activate', (load) ->
          received.push "ACTIVATE #{load}"
          return
        inst.on 'deactivate', (load) ->
          received.push "DEACTIVATE #{load}"
          sendNext()
          return unless received.length is expected.length
          chai.expect(received).to.eql expected
          done()
          return
        inst.start (err) ->
          if err
            done err
            return
          sendNext()
          return
        return
      return
    return
  describe 'event forwarding on parent network', ->
    describe 'with a single level subgraph', ->
      graph = null
      network = null
      before (done) ->
        graph = new noflo.Graph 'main'
        graph.baseDir = root
        noflo.createNetwork graph,
          delay: true
          subscribeGraph: false
        , (err, nw) ->
          if err
            done err
            return
          network = nw
          network.loader.components.Split = Split
          network.loader.components.Merge = SubgraphMerge
          sg = new noflo.Graph 'Subgraph'
          sg.addNode 'A', 'Split'
          sg.addNode 'B', 'Merge'
          sg.addEdge 'A', 'out', 'B', 'in'
          sg.addInport 'in', 'A', 'in'
          sg.addOutport 'out', 'B', 'out'
          network.loader.registerGraph 'foo', 'AB', sg, (err) ->
            if err
              done err
              return
            network.connect done
            return
          return
        return
      it 'should instantiate the subgraph when node is added', (done) ->
        network.addNode
          id: 'Sub'
          component: 'foo/AB'
        , (err) ->
          if err
            done err
            return
          network.addNode
            id: 'Split'
            component: 'Split'
          , (err) ->
            if err
              done err
              return
            network.addEdge
              from:
                node: 'Sub'
                port: 'out'
              to:
                node: 'Split'
                port: 'in'
            , (err) ->
              if err
                done err
                return
              chai.expect(network.processes).not.to.be.empty
              chai.expect(network.processes.Sub).to.exist
              done()
              return
            return
          return
        return
      it 'should be possible to start the graph', (done) ->
        network.start done
        return
      it 'should forward IP events', (done) ->
        network.once 'ip', (ip) ->
          chai.expect(ip.id).to.equal 'DATA -> IN Sub()'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.data).to.equal 'foo'
          chai.expect(ip.subgraph).to.be.undefined
          network.once 'ip', (ip) ->
            chai.expect(ip.id).to.equal 'A() OUT -> IN B()'
            chai.expect(ip.type).to.equal 'data'
            chai.expect(ip.data).to.equal 'foo'
            chai.expect(ip.subgraph).to.eql [
              'Sub'
            ]
            network.once 'ip', (ip) ->
              chai.expect(ip.id).to.equal 'Sub() OUT -> IN Split()'
              chai.expect(ip.type).to.equal 'data'
              chai.expect(ip.data).to.equal 'foo'
              chai.expect(ip.subgraph).to.be.undefined
              done()
              return
            return
          return
        network.addInitial
          from:
            data: 'foo'
          to:
            node: 'Sub'
            port: 'in'
        , (err) ->
          if err
            done err
            return
          return
        return
      return
    describe 'with two levels of subgraphs', ->
      graph = null
      network = null
      before (done) ->
        graph = new noflo.Graph 'main'
        graph.baseDir = root
        noflo.createNetwork graph,
          delay: true
          subscribeGraph: false
        , (err, net) ->
          if err
            done err
            return
          network = net
          network.loader.components.Split = Split
          network.loader.components.Merge = SubgraphMerge
          sg = new noflo.Graph 'Subgraph'
          sg.addNode 'A', 'Split'
          sg.addNode 'B', 'Merge'
          sg.addEdge 'A', 'out', 'B', 'in'
          sg.addInport 'in', 'A', 'in'
          sg.addOutport 'out', 'B', 'out'
          sg2 = new noflo.Graph 'Subgraph'
          sg2.addNode 'A', 'foo/AB'
          sg2.addNode 'B', 'Merge'
          sg2.addEdge 'A', 'out', 'B', 'in'
          sg2.addInport 'in', 'A', 'in'
          sg2.addOutport 'out', 'B', 'out'
          network.loader.registerGraph 'foo', 'AB', sg, (err) ->
            if err
              done err
              return
            network.loader.registerGraph 'foo', 'AB2', sg2, (err) ->
              if err
                done err
                return
              network.connect done
              return
            return
          return
        return
      it 'should instantiate the subgraphs when node is added', (done) ->
        network.addNode
          id: 'Sub'
          component: 'foo/AB2'
        , (err) ->
          if err
            done err
            return
          network.addNode
            id: 'Split'
            component: 'Split'
          , (err) ->
            if err
              done err
              return
            network.addEdge
              from:
                node: 'Sub'
                port: 'out'
              to:
                node: 'Split'
                port: 'in'
            , (err) ->
              if err
                done err
                return
              chai.expect(network.processes).not.to.be.empty
              chai.expect(network.processes.Sub).to.exist
              done()
              return
            return
          return
        return
      it 'should be possible to start the graph', (done) ->
        network.start done
        return
      it 'should forward IP events', (done) ->
        network.once 'ip', (ip) ->
          chai.expect(ip.id).to.equal 'DATA -> IN Sub()'
          chai.expect(ip.type).to.equal 'data'
          chai.expect(ip.data).to.equal 'foo'
          chai.expect(ip.subgraph).to.be.undefined
          network.once 'ip', (ip) ->
            chai.expect(ip.id).to.equal 'A() OUT -> IN B()'
            chai.expect(ip.type).to.equal 'data'
            chai.expect(ip.data).to.equal 'foo'
            chai.expect(ip.subgraph).to.eql [
              'Sub'
              'A'
            ]
            network.once 'ip', (ip) ->
              chai.expect(ip.id).to.equal 'A() OUT -> IN B()'
              chai.expect(ip.type).to.equal 'data'
              chai.expect(ip.data).to.equal 'foo'
              chai.expect(ip.subgraph).to.eql [
                'Sub'
              ]
              network.once 'ip', (ip) ->
                chai.expect(ip.id).to.equal 'Sub() OUT -> IN Split()'
                chai.expect(ip.type).to.equal 'data'
                chai.expect(ip.data).to.equal 'foo'
                chai.expect(ip.subgraph).to.be.undefined
                done()
                return
              return
            return
          return
        network.addInitial
          from:
            data: 'foo'
          to:
            node: 'Sub'
            port: 'in'
        , (err) ->
          if err
            done err
            return
          return
        return
      return
    return
  return
