if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  subgraph = require '../src/components/Graph.coffee'
  graph = require '../src/lib/Graph.coffee'
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
  urlPrefix = './'
else
  subgraph = require 'noflo/src/components/Graph.js'
  graph = require 'noflo/src/lib/Graph.js'
  noflo = require 'noflo/src/lib/NoFlo.js'
  root = 'noflo'
  urlPrefix = '/'

describe 'Graph component', ->
  c = null
  g = null
  start = null
  beforeEach ->
    c = subgraph.getComponent()
    g = noflo.internalSocket.createSocket()
    start = noflo.internalSocket.createSocket()
    c.inPorts.graph.attach g
    c.inPorts.start.attach start

  class Split extends noflo.Component
    constructor: ->
      @inPorts =
        in: new noflo.Port
      @outPorts =
        out: new noflo.ArrayPort
      @inPorts.in.on 'connect', (data) =>
        @outPorts.out.connect()
      @inPorts.in.on 'data', (data) =>
        @outPorts.out.send data
      @inPorts.in.on 'disconnect', =>
        @outPorts.out.disconnect()
  Split.getComponent = -> new Split

  SubgraphMerge = ->
    inst = new noflo.Component
    inst.inPorts.add 'in', (event, payload, instance) ->
      method = event
      method = 'send' if event is 'data'
      instance.outPorts[method] 'out', payload
    inst.outPorts.add 'out'
    inst

  describe 'initially', ->
    it 'should be ready', ->
      chai.expect(c.ready).to.be.true
    it 'should not contain a network', ->
      chai.expect(c.network).to.be.null
    it 'should not have a baseDir', ->
      chai.expect(c.baseDir).to.be.null
    it 'should only have the graph and start inports', ->
      chai.expect(c.inPorts.ports).to.have.keys ['graph', 'start']
      chai.expect(c.outPorts.ports).to.be.empty

  describe 'with JSON graph definition', ->
    it 'should emit a ready event after network has been loaded', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
      c.once 'network', (network) ->
        network.loader.components.Split = Split
        network.loader.registerComponent '', 'Merge', SubgraphMerge
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        start.send true
      g.send
        processes:
          Split:
            component: 'Split'
          Merge:
            component: 'Merge'
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
          'start'
          'merge.in'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'split.out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
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
    it 'should update description from the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        chai.expect(c.description).to.equal 'Hello, World!'
        done()
      c.once 'network', (network) ->
        network.loader.components.Split = Split
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        chai.expect(c.description).to.equal 'Hello, World!'
        start.send true
      g.send
        properties:
          description: 'Hello, World!'
        processes:
          Split:
            component: 'Split'
    it 'should expose only exported ports when they exist', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
          'start'
          'merge.in'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send
        exports: [
          public: 'out'
          private: 'split.out'
        ]
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
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        ins = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts['merge.in'].attach ins
        c.outPorts['split.out'].attach out
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          done()
        ins.send 'Foo'
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
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

  describe 'with a Graph instance', ->
    gr = new graph.Graph 'Hello, world'
    gr.baseDir = root
    gr.addNode 'Split', 'Split'
    gr.addNode 'Merge', 'Merge'
    gr.addEdge 'Merge', 'out', 'Split', 'in'
    it 'should emit a ready event after network has been loaded', (done) ->
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send gr
      chai.expect(c.ready).to.be.false
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
          'start'
          'merge.in'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'split.out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send gr
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        ins = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts['merge.in'].attach ins
        c.outPorts['split.out'].attach out
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          done()
        ins.send 'Foo'
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send gr

  describe 'with a FBP file with INPORTs and OUTPORTs', ->
    file = "#{urlPrefix}spec/fixtures/subgraph.fbp"
    it 'should emit a ready event after network has been loaded', (done) ->
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send file
      chai.expect(c.ready).to.be.false
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
          'start'
          'in'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send file
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        ins = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts['in'].attach ins
        c.outPorts['out'].attach out
        out.on 'connect', ->
          ins.send 'Foo'
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          ins.disconnect()
        out.on 'disconnect', ->
          done()
        ins.connect()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send file

  describe 'with a FBP file with legacy EXPORTS', ->
    file = "#{urlPrefix}spec/fixtures/subgraph_legacy.fbp"
    it 'should emit a ready event after network has been loaded', (done) ->
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send file
      chai.expect(c.ready).to.be.false
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts.ports).to.have.keys [
          'graph'
          'start'
          'in'
        ]
        chai.expect(c.outPorts.ports).to.have.keys [
          'out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send file
    it 'should have disambiguated the exported ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network.graph.exports).to.be.empty
        chai.expect(c.network.graph.inports).to.be.not.empty
        chai.expect(c.network.graph.inports.in).to.be.an 'object'
        chai.expect(c.network.graph.outports).to.be.not.empty
        chai.expect(c.network.graph.outports.out).to.be.an 'object'
        done()
      c.once 'network', ->
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
      g.send file
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        ins = noflo.internalSocket.createSocket()
        out = noflo.internalSocket.createSocket()
        c.inPorts['in'].attach ins
        c.outPorts['out'].attach out
        out.on 'connect', ->
          ins.send 'Foo'
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          ins.disconnect()
        out.on 'disconnect', ->
          done()
        ins.connect()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = SubgraphMerge
        start.send true
      g.send file
