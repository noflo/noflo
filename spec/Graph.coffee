{expect} = require 'chai'
graph = require '../src/lib/Graph.coffee'

describe 'Graph instance', ->
  g = null
  it 'should have no nodes initially', ->
    g = new graph.Graph
    expect(g.nodes.length).to.equal 0
