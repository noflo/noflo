if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
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

  describe 'loaded from JSON', ->
    json =
      properties:
        name: 'Example'
        foo: 'Baz'
        bar: 'Foo'
      exports: [
        public: 'in'
        private: 'foo.in'
        metadata:
          x: 5
          y: 100
      ,
        public: 'out'
        private: 'bar.out'
      ]
      groups: [
        nodes: ['Foo', 'Bar']
        metadata:
          label: 'Main'
      ]
      processes:
        Foo:
          component: 'Bar'
          metadata:
            display:
              x: 100
              y: 200
            routes: [
              'one'
              'two'
            ]
        Bar:
          component: 'Baz'
      connections: [
        src:
          process: 'Foo'
          port: 'out'
        tgt:
          process: 'Bar'
          port: 'in'
        metadata:
          route: 'foo'
      ,
        data: 'Hello, world!'
        tgt:
          process: 'Foo'
          port: 'in'
      ]
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
    it 'should contain two nodes', ->
      chai.expect(g.nodes.length).to.equal 2
    it 'the first Node should have its metadata intact', ->
      node = g.getNode 'Foo'
      chai.expect(node.metadata).to.be.an 'object'
      chai.expect(node.metadata.display).to.be.an 'object'
      chai.expect(node.metadata.display.x).to.equal 100
      chai.expect(node.metadata.display.y).to.equal 200
      chai.expect(node.metadata.routes).to.be.an 'array'
      chai.expect(node.metadata.routes).to.contain 'one'
      chai.expect(node.metadata.routes).to.contain 'two'
    it 'should contain one connection', ->
      chai.expect(g.edges.length).to.equal 1
    it 'the first Edge should have its metadata intact', ->
      edge = g.edges[0]
      chai.expect(edge.metadata).to.be.an 'object'
      chai.expect(edge.metadata.route).equal 'foo'
    it 'should contain one IIP', ->
      chai.expect(g.initializers.length).to.equal 1
    it 'should contain two exports', ->
      chai.expect(g.exports.length).to.equal 2
    it 'should contain one group', ->
      chai.expect(g.edges.length).to.equal 1
    it 'should produce same JSON when serialized', ->
      chai.expect(JSON.stringify(g.toJSON())).to.equal JSON.stringify(json)
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
        exports = 0
        for exported in g.exports
          [exportedNode, exportedPort] = exported.private.split '.'
          exports++ if exportedNode is 'baz'
        chai.expect(exports).to.equal 1
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
    describe 'removing a node', ->
      it 'should emit an event', (done) ->
        g.once 'removeNode', (node) ->
          chai.expect(node.id).to.equal 'Baz'
          done()
        g.removeNode 'Baz'
      it 'shouldn\'t be have edges left behind', ->
        connections = 0
        for edge in g.edges
          connections++ if edge.from.node is 'Baz'
          connections++ if edge.to.node is 'Baz'
        chai.expect(connections).to.equal 0
      it 'shouldn\'t be have IIPs left behind', ->
        connections = 0
        for edge in g.initializers
          connections++ if edge.to.node is 'Baz'
        chai.expect(connections).to.equal 0
      it 'shouldn\'t be have exports left behind', ->
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

  describe 'with no nodes', ->
    g = new graph.Graph
    it 'should not allow adding edges', ->
      g.addEdge 'Foo', 'out', 'Bar', 'in'
      chai.expect(graph.edges).to.be.empty
    it 'should not allow adding IIPs', ->
      g.addInitial 'Hello', 'Bar', 'in'
      chai.expect(graph.initializers).to.be.empty
