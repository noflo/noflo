if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  subgraph = require '../src/components/Graph.coffee'
  graph = require '../src/lib/Graph.coffee'
  socket = require '../src/lib/InternalSocket.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  subgraph = require 'noflo/src/components/Graph.js'
  graph = require 'noflo/src/lib/Graph.js'
  socket = require 'noflo/src/lib/InternalSocket.js'
  root = 'noflo'

describe 'Graph component', ->
  c = null
  g = null
  beforeEach ->
    c = subgraph.getComponent()
    g = socket.createSocket()
    c.inPorts.graph.attach g

  describe 'initially', ->
    it 'should be ready', ->
      chai.expect(c.ready).to.be.true
    it 'should not contain a network', ->
      chai.expect(c.network).to.be.null
    it 'should not have a baseDir', ->
      chai.expect(c.baseDir).to.be.null
    it 'should only have the graph inport', ->
      chai.expect(c.inPorts).to.have.keys ['graph']
      chai.expect(c.outPorts).to.be.empty

  describe 'with JSON graph definition', ->
    it 'should emit a ready event after network has been loaded', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.network).not.to.be.null
        chai.expect(c.ready).to.be.true
        done()
      g.send
        processes:
          Split:
            component: 'Split'
          Merge:
            component: 'Merge'
      chai.expect(c.ready).to.be.false
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts).to.have.keys [
          'graph'
          'merge.in'
        ]
        chai.expect(c.outPorts).to.have.keys [
          'split.out'
        ]
        done()
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
        ]
        chai.expect(c.outPorts).to.have.keys [
          'out'
        ]
        done()
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
        ins = socket.createSocket()
        out = socket.createSocket()
        c.inPorts['merge.in'].attach ins
        c.outPorts['split.out'].attach out
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          done()
        ins.send 'Foo'
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
      g.send gr
      chai.expect(c.ready).to.be.false
    it 'should expose available ports', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        chai.expect(c.inPorts).to.have.keys [
          'graph'
          'merge.in'
        ]
        chai.expect(c.outPorts).to.have.keys [
          'split.out'
        ]
        done()
      g.send gr
    it 'should be able to run the graph', (done) ->
      c.baseDir = root
      c.once 'ready', ->
        ins = socket.createSocket()
        out = socket.createSocket()
        c.inPorts['merge.in'].attach ins
        c.outPorts['split.out'].attach out
        out.on 'data', (data) ->
          chai.expect(data).to.equal 'Foo'
          done()
        ins.send 'Foo'
      g.send gr
