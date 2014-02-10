journal = require '../src/lib/Journal.coffee'
graph = require '../src/lib/Graph.coffee'

exports["Journal connected to initialized graph"] = (test) ->
  g = new graph.Graph
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  j = new journal.Journal(g)
  test.equals j.lastRevision, 0

  test.done()

exports["Journal following basic graph changes"] = (test) ->
  g = new graph.Graph
  j = new journal.Journal(g)
  test.equals j.lastRevision, 0
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  test.equals j.lastRevision, 3
  g.removeNode 'Baz'
  test.equals j.lastRevision, 4

  test.done()

exports["Journal pretty output"] = (test) ->
  g = new graph.Graph
  j = new journal.Journal(g)
  g.startTransaction 'test1'
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  g.addInitial 42, 'Foo', 'in'
  g.removeNode 'Foo'
  g.endTransaction 'test1'

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

  test.equals j.toPrettyString(), ref

  test.done()

exports["Journal jump backwards"] = (test) ->
  g = new graph.Graph
  j = new journal.Journal(g)
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  g.addInitial 42, 'Foo', 'in'
  g.removeNode 'Foo'

  j.moveToRevision 0
  test.equals g.nodes.length, 0

  j.moveToRevision 2
  test.equals g.nodes.length, 2

  j.moveToRevision 5
  test.equals g.nodes.length, 1

  test.done()

exports["Journal linear undo/redo"] = (test) ->
  g = new graph.Graph
  j = new journal.Journal(g)
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  g.addInitial 42, 'Foo', 'in'
  beforeError = g.toJSON()
  test.equals g.nodes.length, 2

  g.removeNode 'Foo'
  test.equals g.nodes.length, 1
  j.undo()
  test.equals g.nodes.length, 2
  test.equals g.toJSON(), beforeError

  j.redo()
  test.equals g.nodes.length, 1

  g.removeNode 'Baz'
  j.undo()
  j.undo()
  test.equals g.nodes.length, 2
  test.equals g.toJSON(), beforeError  

  test.done()

# FIXME: add tests for graph.loadJSON/loadFile, and journal metadata

