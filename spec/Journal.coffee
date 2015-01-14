if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  graph = require '../src/lib/Graph.coffee'
  journal = require '../src/lib/Journal.coffee'
else
  graph = require 'noflo/src/lib/Graph.js'
  journal = require 'noflo/src/lib/Journal.js'

describe 'Journal', ->
  describe 'connected to initialized graph', ->
    g = new graph.Graph
    g.addNode 'Foo', 'Bar'
    g.addNode 'Baz', 'Foo'
    g.addEdge 'Foo', 'out', 'Baz', 'in'
    j = new journal.Journal(g)
    it 'should have just the initial transaction', ->
      chai.expect(j.store.lastRevision).to.equal 0

  describe 'following basic graph changes', ->
    g = new graph.Graph
    j = new journal.Journal(g)
    it 'should create one transaction per change', ->
      g.addNode 'Foo', 'Bar'
      g.addNode 'Baz', 'Foo'
      g.addEdge 'Foo', 'out', 'Baz', 'in'
      chai.expect(j.store.lastRevision).to.equal 3
      g.removeNode 'Baz'
      chai.expect(j.store.lastRevision).to.equal 4

  describe 'pretty printing', ->
    g = new graph.Graph
    j = new journal.Journal(g)

    g.startTransaction 'test1'
    g.addNode 'Foo', 'Bar'
    g.addNode 'Baz', 'Foo'
    g.addEdge 'Foo', 'out', 'Baz', 'in'
    g.addInitial 42, 'Foo', 'in'
    g.removeNode 'Foo'
    g.endTransaction 'test1'

    g.startTransaction 'test2'
    g.removeNode 'Baz'
    g.endTransaction 'test2'

    it 'should be human readable', ->
      ref = """>>> 0: initial
        <<< 0: initial
        >>> 1: test1
        Foo(Bar)
        Baz(Foo)
        Foo out -> in Baz
        '42' -> in Foo
        META Foo out -> in Baz
        Foo out -X> in Baz
        '42' -X> in Foo
        META Foo
        DEL Foo(Bar)
        <<< 1: test1"""
      chai.expect(j.toPrettyString(0,2)).to.equal ref

  describe 'jumping to revision', ->
    g = new graph.Graph
    j = new journal.Journal(g)
    g.addNode 'Foo', 'Bar'
    g.addNode 'Baz', 'Foo'
    g.addEdge 'Foo', 'out', 'Baz', 'in'
    g.addInitial 42, 'Foo', 'in'
    g.removeNode 'Foo'
    it 'should change the graph', ->
      j.moveToRevision 0
      chai.expect(g.nodes.length).to.equal 0
      j.moveToRevision 2
      chai.expect(g.nodes.length).to.equal 2
      j.moveToRevision 5
      chai.expect(g.nodes.length).to.equal 1

  describe 'linear undo/redo', ->
    g = new graph.Graph
    j = new journal.Journal(g)
    g.addNode 'Foo', 'Bar'
    g.addNode 'Baz', 'Foo'
    g.addEdge 'Foo', 'out', 'Baz', 'in'
    g.addInitial 42, 'Foo', 'in'
    graphBeforeError = g.toJSON()
    chai.expect(g.nodes.length).to.equal 2
    it 'undo should restore previous revision', ->
      g.removeNode 'Foo'
      chai.expect(g.nodes.length).to.equal 1
      j.undo()
      chai.expect(g.nodes.length).to.equal 2
      chai.expect(g.toJSON()).to.deep.equal graphBeforeError
    it 'redo should apply the same change again', ->
      j.redo()
      chai.expect(g.nodes.length).to.equal 1
    it 'undo should also work multiple revisions back', ->
      g.removeNode 'Baz'
      j.undo()
      j.undo()
      chai.expect(g.nodes.length).to.equal 2
      chai.expect(g.toJSON()).to.deep.equal graphBeforeError

  describe 'undo/redo of metadata changes', ->
    g = new graph.Graph
    j = new journal.Journal(g)
    g.addNode 'Foo', 'Bar'
    g.addNode 'Baz', 'Foo'
    g.addEdge 'Foo', 'out', 'Baz', 'in'

    it 'adding group', ->
      g.addGroup 'all', ['Foo', 'Bax'], {'label': 'all nodes'}
      chai.expect(g.groups.length).to.equal 1
      chai.expect(g.groups[0].name).to.equal 'all'
    it 'undoing group add', ->
      j.undo()
      chai.expect(g.groups.length).to.equal 0
    it 'redoing group add', ->
      j.redo()
      chai.expect(g.groups[0].metadata['label']).to.equal 'all nodes'

    it 'changing group metadata adds revision', ->
      r = j.store.lastRevision
      g.setGroupMetadata 'all', {'label': 'ALL NODES!'}
      chai.expect(j.store.lastRevision).to.equal r+1
    it 'undoing group metadata change', ->
      j.undo()
      chai.expect(g.groups[0].metadata['label']).to.equal "all nodes"
    it 'redoing group metadata change', ->
      j.redo()
      chai.expect(g.groups[0].metadata['label']).to.equal "ALL NODES!"

    it 'setting node metadata', ->
      g.setNodeMetadata 'Foo', {"oneone": 11, 2: "two"}
      chai.expect(Object.keys(g.getNode('Foo').metadata).length).to.equal 2
    it 'undoing set node metadata', ->
      j.undo()
      chai.expect(Object.keys(g.getNode('Foo').metadata).length).to.equal 0
    it 'redoing set node metadata', ->
      j.redo()
      chai.expect(g.getNode('Foo').metadata["oneone"]).to.equal 11


describe 'Journalling of graph merges', ->
  A = """
  {
  "properties": { "name": "Example", "foo": "Baz", "bar": "Foo" },
  "inports": {
    "in": { "process": "Foo", "port": "in", "metadata": { "x": 5, "y": 100 } }
  },
  "outports": {
    "out": { "process": "Bar", "port": "out", "metadata": { "x": 500, "y": 505 } }
  },
  "groups": [
    { "name": "first", "nodes": [ "Foo" ], "metadata": { "label": "Main" } },
    { "name": "second", "nodes": [ "Foo2", "Bar2" ], "metadata": {} }
  ],
  "processes": {
    "Foo": { "component": "Bar", "metadata": { "display": { "x": 100, "y": 200 }, "hello": "World" } },
    "Bar": { "component": "Baz", "metadata": {} },
    "Foo2": { "component": "foo", "metadata": {} },
    "Bar2": { "component": "bar", "metadata": {} }
  },
  "connections": [
    { "src": { "process": "Foo", "port": "out" }, "tgt": { "process": "Bar", "port": "in" }, "metadata": { "route": "foo", "hello": "World" } },
    { "src": { "process": "Foo", "port": "out2" }, "tgt": { "process": "Bar", "port": "in2" } },
    { "data": "Hello, world!", "tgt": { "process": "Foo", "port": "in" } },
    { "data": "Hello, world, 2!", "tgt": { "process": "Foo", "port": "in2" } },
    { "data": "Cheers, world!", "tgt": { "process": "Foo", "port": "arr" } }
  ]
  }"""

  B = """
  {
  "properties": { "name": "Example", "foo": "Baz", "bar": "Foo" },
  "inports": {
    "in": { "process": "Foo", "port": "in", "metadata": { "x": 500, "y": 1 } }
  },
  "outports": {
    "out": { "process": "Bar", "port": "out", "metadata": { "x": 500, "y": 505 } }
  },
  "groups": [
    { "name": "second", "nodes": [ "Foo", "Bar" ] }
  ],
  "processes": {
    "Foo": { "component": "Bar", "metadata": { "display": { "x": 100, "y": 200 }, "hello": "World" } },
    "Bar": { "component": "Baz", "metadata": {} },
    "Bar2": { "component": "bar", "metadata": {} },
    "Bar3": { "component": "bar2", "metadata": {} }
  },
  "connections": [
    { "src": { "process": "Foo", "port": "out" }, "tgt": { "process": "Bar", "port": "in" }, "metadata": { "route": "foo", "hello": "World" } },
    { "src": { "process": "Foo2", "port": "out2" }, "tgt": { "process": "Bar3", "port": "in2" } },
    { "data": "Hello, world!", "tgt": { "process": "Foo", "port": "in" } },
    { "data": "Hello, world, 2!", "tgt": { "process": "Bar3", "port": "in2" } },
    { "data": "Cheers, world!", "tgt": { "process": "Bar2", "port": "arr" } }
  ]
  }"""
  a = null
  b = null
  g = null # one we modify
  j = null
  describe 'G -> B', ->
    it 'G starts out as A', (done) ->
      graph.loadJSON JSON.parse(A), (instance) ->
        a = instance
        graph.loadJSON JSON.parse(A), (instance) ->
          g = instance
          chai.expect(graph.equivalent(a, g)).to.equal true
          done()
    it 'G and B starts out different', (done) ->
      graph.loadJSON JSON.parse(B), (instance) ->
        b = instance
        chai.expect(graph.equivalent(g, b)).to.equal false
        done()
    it 'merge should make G equivalent to B', (done) ->
      j = new journal.Journal(g)
      g.startTransaction 'merge'
      graph.mergeResolveTheirs g, b
      g.endTransaction 'merge'
      chai.expect(graph.equivalent(g, b)).to.equal true
      done()
    it 'undoing merge should make G equivalent to A again', (done) ->
      j.undo()
      res = graph.equivalent g, a
      chai.expect(res).to.equal true
      done()

# FIXME: add tests for graph.loadJSON/loadFile, and journal metadata

