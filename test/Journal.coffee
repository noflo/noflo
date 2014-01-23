journal = require '../src/lib/Journal.coffee'
graph = require '../src/lib/Graph.coffee'

exports["Journal connected to initialized graph"] = (test) ->
  g = new graph.Graph
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  j = new journal.Journal(g)
  test.equals j.entries.length, 1+3

  test.done()

exports["Journal following basic graph changes"] = (test) ->
  g = new graph.Graph
  j = new journal.Journal(g)
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  test.equals j.entries.length, 1+3

  g.removeNode 'Baz'
  test.equals j.entries.length, 1+5 # edge is removed also

  test.done()

exports["Journal pretty output"] = (test) ->
  g = new graph.Graph
  j = new journal.Journal(g)
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  g.addInitial 42, 'Foo', 'in'
  g.removeNode 'Foo'

  ref = """INIT
    Foo(Bar)
    Baz(Foo)
    Foo out -> in Baz
    '42' -> in Foo
    Foo out -X> in Baz
    '42' -X> in Foo
    DEL Foo(Bar)"""

  test.equals j.toPrettyString(), ref

  test.done()

exports["Journal move backwards"] = (test) ->
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

  # FIXME: this is logically revision 5, but the removeNode caused a removeInitial and removeEdge. Introduce transactions
  j.moveToRevision 7
  test.equals g.nodes.length, 1

  test.done()
