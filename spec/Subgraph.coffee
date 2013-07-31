if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  subgraph = require '../src/components/Graph.coffee'
  graph = require '../src/lib/Graph.coffee'
  noflo = require '../src/lib/NoFlo.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  subgraph = require 'noflo/src/components/Graph.js'
  graph = require 'noflo/src/lib/Graph.js'
  noflo = require 'noflo/src/lib/NoFlo.js'
  root = 'noflo'


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
      @inPorts.in.on 'data', (data) =>
        @outPorts.out.send data
      @inPorts.in.on 'disconnect', =>
        @outPorts.out.disconnect()
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

  describe 'initially', ->
    it 'should be ready', ->
      chai.expect(c.ready).to.be.true
    it 'should not contain a network', ->
      chai.expect(c.network).to.be.null
    it 'should not have a baseDir', ->
      chai.expect(c.baseDir).to.be.null
    it 'should only have the graph and start inports', ->
      chai.expect(c.inPorts).to.have.keys ['graph', 'start']
      chai.expect(c.outPorts).to.be.empty

  describe 'with JSON graph definition', ->
    it 'should emit a ready event after network has been loaded', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
      c.once 'network', (network) ->
        network.loader.components.Split = Split
        network.loader.components.Merge = Merge
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
        chai.expect(c.inPorts).to.have.keys [
          'graph'
          'start'
          'merge.in'
        ]
        chai.expect(c.outPorts).to.have.keys [
          'split.out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = Merge
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
    it 'should expose only exported ports when they exist', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts).to.have.keys [
          'graph'
          'start'
        ]
        chai.expect(c.outPorts).to.have.keys [
          'out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = Merge
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
        c.network.loader.components.Merge = Merge
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
        c.network.loader.components.Merge = Merge
        start.send true
      g.send gr
      chai.expect(c.ready).to.be.false
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts).to.have.keys [
          'graph'
          'start'
          'merge.in'
        ]
        chai.expect(c.outPorts).to.have.keys [
          'split.out'
        ]
        done()
      c.once 'network', ->
        chai.expect(c.ready).to.be.false
        chai.expect(c.network).not.to.be.null
        c.network.loader.components.Split = Split
        c.network.loader.components.Merge = Merge
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
        c.network.loader.components.Merge = Merge
        start.send true
      g.send gr
