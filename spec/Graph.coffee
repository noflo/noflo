if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  graph = require '../src/lib/Graph.coffee'
else
  graph = require 'noflo/src/lib/Graph.js'

describe 'Unnamed graph instance', ->
  it 'should have an empty name', ->
    g = new graph.Graph
    chai.expect(g.name).to.equal ''

describe 'Graph', ->
  describe 'with new instance', ->
    g = null
    it 'should get a name from constructor', ->
      g = new graph.Graph 'Foo bar'
      chai.expect(g.name).to.equal 'Foo bar'

    it 'should have no nodes initially', ->
      chai.expect(g.nodes.length).to.equal 0
    it 'should have no edges initially', ->
      chai.expect(g.edges.length).to.equal 0
    it 'should have no initializers initially', ->
      chai.expect(g.initializers.length).to.equal 0
    it 'should have no exports initially', ->
      chai.expect(g.exports.length).to.equal 0
      chai.expect(g.inports).to.be.empty
      chai.expect(g.outports).to.be.empty

    describe 'New node', ->
      n = null
      it 'should emit an event', (done) ->
        g.once 'addNode', (node) ->
          chai.expect(node.id).to.equal 'Foo'
          chai.expect(node.component).to.equal 'Bar'
          n = node
          done()
        g.addNode 'Foo', 'Bar'
      it 'should be in graph\'s list of nodes', ->
        chai.expect(g.nodes.length).to.equal 1
        chai.expect(g.nodes.indexOf(n)).to.equal 0
      it 'should be accessible via the getter', ->
        node = g.getNode 'Foo'
        chai.expect(node.id).to.equal 'Foo'
        chai.expect(node).to.equal n
      it 'should have empty metadata', ->
        node = g.getNode 'Foo'
        chai.expect(JSON.stringify(node.metadata)).to.equal '{}'
        chai.expect(node.display).to.equal undefined
      it 'should be available in the JSON export', ->
        json = g.toJSON()
        chai.expect(typeof json.processes.Foo).to.equal 'object'
        chai.expect(json.processes.Foo.component).to.equal 'Bar'
        chai.expect(json.processes.Foo.display).to.not.exist
      it 'removing should emit an event', (done) ->
        g.once 'removeNode', (node) ->
          chai.expect(node.id).to.equal 'Foo'
          chai.expect(node).to.equal n
          done()
        g.removeNode 'Foo'
      it 'should not be available after removal', ->
        node = g.getNode 'Foo'
        chai.expect(node).to.not.exist
        chai.expect(g.nodes.length).to.equal 0
        chai.expect(g.nodes.indexOf(n)).to.equal -1
    describe 'New edge', ->
      it 'should emit an event', (done) ->
        g.addNode 'Foo', 'foo'
        g.addNode 'Bar', 'bar'
        g.once 'addEdge', (edge) ->
          chai.expect(edge.from.node).to.equal 'Foo'
          chai.expect(edge.to.port).to.equal 'in'
          done()
        g.addEdge('Foo', 'out', 'Bar', 'in')
      it 'should add an edge', ->
        g.addEdge('Foo', 'out', 'Bar', 'in2')
        chai.expect(g.edges.length).equal 2
      it 'should refuse to add a duplicate edge', ->
        edge = g.edges[0]
        g.addEdge(edge.from.node, edge.from.port, edge.to.node, edge.to.port)
        chai.expect(g.edges.length).equal 2
    describe 'New edge with index', ->
      it 'should emit an event', (done) ->
        g.once 'addEdge', (edge) ->
          chai.expect(edge.from.node).to.equal 'Foo'
          chai.expect(edge.to.port).to.equal 'in'
          chai.expect(edge.to.index).to.equal 1
          chai.expect(edge.from.index).to.be.an 'undefined'
          chai.expect(g.edges.length).equal 3
          done()
        g.addEdgeIndex('Foo', 'out', null, 'Bar', 'in', 1)
      it 'should add an edge', ->
        g.addEdgeIndex('Foo', 'out', 2, 'Bar', 'in2')
        chai.expect(g.edges.length).equal 4

  describe 'loaded from JSON', ->
    jsonString = """
{
  "properties": {
    "name": "Example",
    "foo": "Baz",
    "bar": "Foo"
  },
  "inports": {
    "in": {
      "process": "Foo",
      "port": "in",
      "metadata": {
        "x": 5,
        "y": 100
      }
    }
  },
  "outports": {
    "out": {
      "process": "Bar",
      "port": "out",
      "metadata": {
        "x": 500,
        "y": 505
      }
    }
  },
  "groups": [
    {
      "name": "first",
      "nodes": [
        "Foo"
      ],
      "metadata": {
        "label": "Main"
      }
    },
    {
      "name": "second",
      "nodes": [
        "Foo2",
        "Bar2"
      ]
    }
  ],
  "processes": {
    "Foo": {
      "component": "Bar",
      "metadata": {
        "display": {
          "x": 100,
          "y": 200
        },
        "routes": [
          "one",
          "two"
        ],
        "hello": "World"
      }
    },
    "Bar": {
      "component": "Baz",
      "metadata": {}
    },
    "Foo2": {
      "component": "foo",
      "metadata": {}
    },
    "Bar2": {
      "component": "bar",
      "metadata": {}
    }
  },
  "connections": [
    {
      "src": {
        "process": "Foo",
        "port": "out"
      },
      "tgt": {
        "process": "Bar",
        "port": "in"
      },
      "metadata": {
        "route": "foo",
        "hello": "World"
      }
    },
    {
      "src": {
        "process": "Foo",
        "port": "out2"
      },
      "tgt": {
        "process": "Bar",
        "port": "in2",
        "index": 2
      },
      "metadata": {
        "route": "foo",
        "hello": "World"
      }
    },
    {
      "data": "Hello, world!",
      "tgt": {
        "process": "Foo",
        "port": "in"
      }
    },
    {
      "data": "Hello, world, 2!",
      "tgt": {
        "process": "Foo",
        "port": "in2"
      }
    },
    {
      "data": "Cheers, world!",
      "tgt": {
        "process": "Foo",
        "port": "arr",
        "index": 0
      }
    },
    {
      "data": "Cheers, world, 2!",
      "tgt": {
        "process": "Foo",
        "port": "arr",
        "index": 1
      }
    }
  ]
}
    """
    json = JSON.parse(jsonString)
    g = null
    it 'should produce a Graph', (done) ->
      graph.loadJSON json, (instance) ->
        g = instance
        chai.expect(g).to.be.an 'object'
        done()
    it 'should have a name', ->
      chai.expect(g.name).to.equal 'Example'
    it 'should have graph metadata intact', ->
      chai.expect(g.properties).to.eql
        foo: 'Baz'
        bar: 'Foo'
    it 'should produce same JSON when serialized', ->
      chai.expect(JSON.stringify(g.toJSON())).to.equal JSON.stringify(json)
    it 'should allow modifying graph metadata', (done) ->
      g.once 'changeProperties', (properties) ->
        chai.expect(properties).to.equal g.properties
        chai.expect(g.properties).to.eql
          foo: 'Baz'
          bar: 'Bar'
          hello: 'World'
        done()
      g.setProperties
        hello: 'World'
        bar: 'Bar'
    it 'should contain four nodes', ->
      chai.expect(g.nodes.length).to.equal 4
    it 'the first Node should have its metadata intact', ->
      node = g.getNode 'Foo'
      chai.expect(node.metadata).to.be.an 'object'
      chai.expect(node.metadata.display).to.be.an 'object'
      chai.expect(node.metadata.display.x).to.equal 100
      chai.expect(node.metadata.display.y).to.equal 200
      chai.expect(node.metadata.routes).to.be.an 'array'
      chai.expect(node.metadata.routes).to.contain 'one'
      chai.expect(node.metadata.routes).to.contain 'two'
    it 'should allow modifying node metadata', (done) ->
      g.once 'changeNode', (node) ->
        chai.expect(node.id).to.equal 'Foo'
        chai.expect(node.metadata.routes).to.be.an 'array'
        chai.expect(node.metadata.routes).to.contain 'one'
        chai.expect(node.metadata.routes).to.contain 'two'
        chai.expect(node.metadata.hello).to.equal 'World'
        done()
      g.setNodeMetadata 'Foo',
        hello: 'World'
    it 'should contain two connections', ->
      chai.expect(g.edges.length).to.equal 2
    it 'the first Edge should have its metadata intact', ->
      edge = g.edges[0]
      chai.expect(edge.metadata).to.be.an 'object'
      chai.expect(edge.metadata.route).equal 'foo'
    it 'should allow modifying edge metadata', (done) ->
      e = g.edges[0]
      g.once 'changeEdge', (edge) ->
        chai.expect(edge).to.equal e
        chai.expect(edge.metadata.route).to.equal 'foo'
        chai.expect(edge.metadata.hello).to.equal 'World'
        done()
      g.setEdgeMetadata e.from.node, e.from.port, e.to.node, e.to.port,
        hello: 'World'
    it 'should contain four IIPs', ->
      chai.expect(g.initializers.length).to.equal 4
    it 'should contain one published inport', ->
      chai.expect(g.inports).to.not.be.empty
    it 'should contain one published outport', ->
      chai.expect(g.outports).to.not.be.empty
    it 'should keep the output export metadata intact', ->
      exp = g.outports.out
      chai.expect(exp.metadata.x).to.equal 500
      chai.expect(exp.metadata.y).to.equal 505
    it 'should contain two groups', ->
      chai.expect(g.groups.length).to.equal 2
    it 'should allow modifying group metadata', (done) ->
      group = g.groups[0]
      g.once 'changeGroup', (grp) ->
        chai.expect(grp).to.equal group
        chai.expect(grp.metadata.label).to.equal 'Main'
        chai.expect(grp.metadata.foo).to.equal 'Bar'
        chai.expect(g.groups[1].metadata).to.be.empty
        done()
      g.setGroupMetadata 'first',
        foo: 'Bar'
    it 'should allow renaming groups', (done) ->
      group = g.groups[0]
      g.once 'renameGroup', (oldName, newName) ->
        chai.expect(oldName).to.equal 'first'
        chai.expect(newName).to.equal 'renamed'
        chai.expect(group.name).to.equal newName
        done()
      g.renameGroup 'first', 'renamed'
    describe 'renaming a node', ->
      it 'should emit an event', (done) ->
        g.once 'renameNode', (oldId, newId) ->
          chai.expect(oldId).to.equal 'Foo'
          chai.expect(newId).to.equal 'Baz'
          done()
        g.renameNode 'Foo', 'Baz'
      it 'should be available with the new name', ->
        chai.expect(g.getNode('Baz')).to.be.an 'object'
      it 'shouldn\'t be available with the old name', ->
        chai.expect(g.getNode('Foo')).to.be.null
      it 'should have the edge still going from it', ->
        connection = null
        for edge in g.edges
          connection = edge if edge.from.node is 'Baz'
        chai.expect(connection).to.be.an 'object'
      it 'should still be exported', ->
        chai.expect(g.inports.in.process).to.equal 'Baz'
      it 'should still be grouped', ->
        groups = 0
        for group in g.groups
          groups++ if group.nodes.indexOf('Baz') isnt -1
        chai.expect(groups).to.equal 1
      it 'shouldn\'t be have edges with the old name', ->
        connection = null
        for edge in g.edges
          connection = edge if edge.from.node is 'Foo'
          connection = edge if edge.to.node is 'Foo'
        chai.expect(connection).to.be.a 'null'
      it 'should have the IIP still going to it', ->
        iip = null
        for edge in g.initializers
          iip = edge if edge.to.node is 'Baz'
        chai.expect(iip).to.be.an 'object'
      it 'shouldn\'t have IIPs going to the old name', ->
        iip = null
        for edge in g.initializers
          iip = edge if edge.to.node is 'Foo'
        chai.expect(iip).to.be.a 'null'
      it 'shouldn\'t be have export going to the old name', ->
        exports = 0
        for exported in g.exports
          [exportedNode, exportedPort] = exported.private.split '.'
          exports++ if exportedNode is 'foo'
        chai.expect(exports).to.equal 0
      it 'shouldn\'t be grouped with the old name', ->
        groups = 0
        for group in g.groups
          groups++ if group.nodes.indexOf('Foo') isnt -1
        chai.expect(groups).to.equal 0
    describe 'renaming an inport', ->
      it 'should emit an event', (done) ->
        g.once 'renameInport', (oldName, newName) ->
          chai.expect(oldName).to.equal 'in'
          chai.expect(newName).to.equal 'opt'
          chai.expect(g.inports.in).to.be.an 'undefined'
          chai.expect(g.inports.opt).to.be.an 'object'
          chai.expect(g.inports.opt.process).to.equal 'Baz'
          chai.expect(g.inports.opt.port).to.equal 'in'
          done()
        g.renameInport 'in', 'opt'
    describe 'renaming an outport', ->
      it 'should emit an event', (done) ->
        g.once 'renameOutport', (oldName, newName) ->
          chai.expect(oldName).to.equal 'out'
          chai.expect(newName).to.equal 'foo'
          chai.expect(g.outports.out).to.be.an 'undefined'
          chai.expect(g.outports.foo).to.be.an 'object'
          chai.expect(g.outports.foo.process).to.equal 'Bar'
          chai.expect(g.outports.foo.port).to.equal 'out'
          done()
        g.renameOutport 'out', 'foo'
    describe 'removing a node', ->
      it 'should emit an event', (done) ->
        g.once 'removeNode', (node) ->
          chai.expect(node.id).to.equal 'Baz'
          done()
        g.removeNode 'Baz'
      it 'shouldn\'t have edges left behind', ->
        connections = 0
        for edge in g.edges
          connections++ if edge.from.node is 'Baz'
          connections++ if edge.to.node is 'Baz'
        chai.expect(connections).to.equal 0
      it 'shouldn\'t have IIPs left behind', ->
        connections = 0
        for edge in g.initializers
          connections++ if edge.to.node is 'Baz'
        chai.expect(connections).to.equal 0
      it 'shouldn\'t have exports left behind', ->
        exports = 0
        for exported in g.exports
          [exportedNode, exportedPort] = exported.private.split '.'
          exports++ if exportedNode is 'baz'
        chai.expect(exports).to.equal 0
      it 'shouldn\'t be grouped', ->
        groups = 0
        for group in g.groups
          groups++ if group.nodes.indexOf('Baz') isnt -1
        chai.expect(groups).to.equal 0
      it 'shouldn\'t affect other groups', ->
        otherGroup = g.groups[1]
        chai.expect(otherGroup.nodes.length).to.equal 2

  describe 'with multiple connected ArrayPorts', ->
    g = new graph.Graph
    g.addNode 'Split1', 'Split'
    g.addNode 'Split2', 'Split'
    g.addNode 'Merge1', 'Merge'
    g.addNode 'Merge2', 'Merge'
    g.addEdge 'Split1', 'out', 'Merge1', 'in'
    g.addEdge 'Split1', 'out', 'Merge2', 'in'
    g.addEdge 'Split2', 'out', 'Merge1', 'in'
    g.addEdge 'Split2', 'out', 'Merge2', 'in'
    it 'should contain four nodes', ->
      chai.expect(g.nodes.length).to.equal 4
    it 'should contain four edges', ->
      chai.expect(g.edges.length).to.equal 4
    it 'should allow a specific edge to be removed', ->
      g.removeEdge 'Split1', 'out', 'Merge2', 'in'
      chai.expect(g.edges.length).to.equal 3
    it 'shouldn\'t contain the removed connection from Split1', ->
      connection = null
      for edge in g.edges
        if edge.from.node is 'Split1' and edge.to.node is 'Merge2'
          connection = edge
      chai.expect(connection).to.be.null
    it 'should still contain the other connection from Split1', ->
      connection = null
      for edge in g.edges
        if edge.from.node is 'Split1' and edge.to.node is 'Merge1'
          connection = edge
      chai.expect(connection).to.be.an 'object'

  describe 'with an Initial Information Packet', ->
    g = new graph.Graph
    g.addNode 'Split', 'Split'
    g.addInitial 'Foo', 'Split', 'in'
    it 'should contain one node', ->
      chai.expect(g.nodes.length).to.equal 1
    it 'should contain no edges', ->
      chai.expect(g.edges.length).to.equal 0
    it 'should contain one IIP', ->
      chai.expect(g.initializers.length).to.equal 1
    describe 'on removing that IIP', ->
      it 'should emit a removeInitial event', (done) ->
        g.once 'removeInitial', (iip) ->
          chai.expect(iip.from.data).to.equal 'Foo'
          chai.expect(iip.to.node).to.equal 'Split'
          chai.expect(iip.to.port).to.equal 'in'
          done()
        g.removeInitial 'Split', 'in'
      it 'should contain no IIPs', ->
        chai.expect(g.initializers.length).to.equal 0

  describe 'with an Inport Initial Information Packet', ->
    g = new graph.Graph
    g.addNode 'Split', 'Split'
    g.addInport 'testinport', 'Split', 'in'
    g.addGraphInitial 'Foo', 'testinport'
    it 'should contain one node', ->
      chai.expect(g.nodes.length).to.equal 1
    it 'should contain no edges', ->
      chai.expect(g.edges.length).to.equal 0
    it 'should contain one IIP for the correct node', ->
      chai.expect(g.initializers.length).to.equal 1
      chai.expect(g.initializers[0].from.data).to.equal 'Foo'
      chai.expect(g.initializers[0].to.node).to.equal 'Split'
      chai.expect(g.initializers[0].to.port).to.equal 'in'
    describe 'on removing that IIP', ->
      it 'should emit a removeInitial event', (done) ->
        g.once 'removeInitial', (iip) ->
          chai.expect(iip.from.data).to.equal 'Foo'
          chai.expect(iip.to.node).to.equal 'Split'
          chai.expect(iip.to.port).to.equal 'in'
          done()
        g.removeGraphInitial 'testinport'
      it 'should contain no IIPs', ->
        chai.expect(g.initializers.length).to.equal 0
    describe 'on adding IIP for a non-existent inport', ->
      g.addGraphInitial 'Bar', 'nonexistent'
      it 'should not add any IIP', ->
        chai.expect(g.initializers.length).to.equal 0

  describe 'with an indexed Inport Initial Information Packet', ->
    g = new graph.Graph
    g.addNode 'Split', 'Split'
    g.addInport 'testinport', 'Split', 'in'
    g.addGraphInitialIndex 'Foo', 'testinport', 1
    it 'should contain one node', ->
      chai.expect(g.nodes.length).to.equal 1
    it 'should contain no edges', ->
      chai.expect(g.edges.length).to.equal 0
    it 'should contain one IIP for the correct node', ->
      chai.expect(g.initializers.length).to.equal 1
      chai.expect(g.initializers[0].from.data).to.equal 'Foo'
      chai.expect(g.initializers[0].to.node).to.equal 'Split'
      chai.expect(g.initializers[0].to.port).to.equal 'in'
      chai.expect(g.initializers[0].to.index).to.equal 1
    describe 'on removing that IIP', ->
      it 'should emit a removeInitial event', (done) ->
        g.once 'removeInitial', (iip) ->
          chai.expect(iip.from.data).to.equal 'Foo'
          chai.expect(iip.to.node).to.equal 'Split'
          chai.expect(iip.to.port).to.equal 'in'
          done()
        g.removeGraphInitial 'testinport'
      it 'should contain no IIPs', ->
        chai.expect(g.initializers.length).to.equal 0
    describe 'on adding IIP for a non-existent inport', ->
      g.addGraphInitialIndex 'Bar', 'nonexistent', 1
      it 'should not add any IIP', ->
        chai.expect(g.initializers.length).to.equal 0

  describe 'with no nodes', ->
    g = new graph.Graph
    it 'should not allow adding edges', ->
      g.addEdge 'Foo', 'out', 'Bar', 'in'
      chai.expect(graph.edges).to.be.empty
    it 'should not allow adding IIPs', ->
      g.addInitial 'Hello', 'Bar', 'in'
      chai.expect(graph.initializers).to.be.empty

  describe 'Legacy exports loaded via JSON', ->
    jsonString = """
{
  "exports": [
    {
      "public": "in",
      "private": "foo.in",
      "metadata": {
        "x": 5,
        "y": 100
      }
    },
    {
      "public": "out",
      "private": "bar.out"
    }
  ],
  "processes": {
    "Foo": {
      "component": "Foooo"
    },
    "Bar": {
      "component": "Baaar"
    }
  }
}
    """
    json = JSON.parse(jsonString)
    g = null
    it 'should produce a Graph', (done) ->
      graph.loadJSON json, (instance) ->
        g = instance
        chai.expect(g).to.be.an 'object'
        done()
    it 'should have two legacy exports', (done) ->
      chai.expect(g.exports).to.be.an 'array'
      chai.expect(g.exports.length).to.equal 2
      done()
    it 'should fix the case of the process key', (done) ->
      chai.expect(g.exports[0].process).to.equal 'Foo'
      chai.expect(g.exports[1].process).to.equal 'Bar'
      done()
