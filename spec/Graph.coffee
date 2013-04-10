if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  graph = require '../src/lib/Graph.coffee'
else
  graph = require 'noflo/lib/Graph.js'

describe 'Graph instance', ->
  g = null
  it 'should have no nodes initially', ->
    g = new graph.Graph
    chai.expect(g.nodes.length).to.equal 0
