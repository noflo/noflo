if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  graph = require '../src/lib/Graph.coffee'
else
  graph = require 'noflo/src/lib/Graph.js'

describe 'Unnamed graph instance', ->
  it 'should have an empty name', ->
    g = new graph.Graph
    chai.expect(g.name).to.equal ''

describe 'Graph instance', ->
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
