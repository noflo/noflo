if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
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
      chai.expect(j.lastRevision).to.equal 0

  describe 'following basic graph changes', ->
    g = new graph.Graph
    j = new journal.Journal(g)
    it 'should create one transaction per change', ->
      g.addNode 'Foo', 'Bar'
      g.addNode 'Baz', 'Foo'
      g.addEdge 'Foo', 'out', 'Baz', 'in'
      chai.expect(j.lastRevision).to.equal 3
      g.removeNode 'Baz'
      chai.expect(j.lastRevision).to.equal 4

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
        Foo out -X> in Baz
        '42' -X> in Foo
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



# FIXME: add tests for graph.loadJSON/loadFile, and journal metadata

