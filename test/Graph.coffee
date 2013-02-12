graph = require '../src/lib/Graph.coffee'

exports["test basic Graph API"] = (test) ->
  g = new graph.Graph
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  test.equals g.edges.length, 1
  test.equals g.nodes.length, 2

  g.removeNode 'Baz'
  test.equals g.edges.length, 0, 'Edges should be empty'
  test.equals g.nodes.length, 1, 'One node should remain'

  test.done()

exports["Test JSON export"] = (test) ->
  g = new graph.Graph
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  json = g.toJSON()
  test.ok json.properties
  test.ok json.processes
  test.ok json.processes['Foo']
  test.ok json.processes['Baz']
  test.ok json.connections
  test.equals json.connections.length, 1
  test.done()

exports["Test port exports in JSON"] = (test) ->
  g = new graph.Graph
  g.addNode 'Foo', 'Bar'
  g.addNode 'Baz', 'Foo'
  g.addEdge 'Foo', 'out', 'Baz', 'in'
  g.addExport 'Foo.IN', 'IN'

  test.equals g.exports.length, 1
  json = g.toJSON()
  test.ok json.exports
  test.equals json.exports.length, 1
  test.equals json.exports[0].private, 'foo.in'
  test.equals json.exports[0].public, 'in'

  test.done()
