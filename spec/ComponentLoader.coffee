if typeof process is 'object' and process.title is 'node'
  chai = require 'chai' unless chai
  loader = require '../src/lib/nodejs/ComponentLoader.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  loader = require 'noflo/src/lib/ComponentLoader.js'
  root = 'noflo'

describe 'ComponentLoader with no external packages installed', ->
  l = new loader.ComponentLoader root

  it 'should initially know of no components', ->
    chai.expect(l.components).to.be.null
  it 'should not initially require revalidation', ->
    chai.expect(l.revalidate).to.be.false
  it 'should not have any packages in the checked list', ->
    chai.expect(l.checked).to.be.empty

  it 'should be able to read a list of components', (done) ->
    l.listComponents (components) ->
      chai.expect(l.components).not.to.be.empty
      chai.expect(components).to.equal l.components
      done()

  it 'should have the Split component registered', ->
    chai.expect(l.components.Split).not.to.be.empty

  describe 'loading the Split component', ->
    instance = null
    it 'should be able to load the component', (done) ->
      l.load 'Split', (split) ->
        chai.expect(split).to.be.an 'object'
        instance = split
        done()
    it 'should contain input ports', ->
      chai.expect(instance.inPorts).to.be.an 'object'
      chai.expect(instance.inPorts.in).to.be.an 'object'
    it 'should have "on" method on the input port', ->
      chai.expect(instance.inPorts.in.on).to.be.a 'function'
    it 'should contain output ports', ->
      chai.expect(instance.outPorts).to.be.an 'object'
      chai.expect(instance.outPorts.out).to.be.an 'object'
    it 'should have "send" method on the output port', ->
      chai.expect(instance.outPorts.out.send).to.be.a 'function'

  describe 'loading the Graph component', ->
    instance = null
    it 'should be able to load the component', (done) ->
      l.load 'Graph', (graph) ->
        chai.expect(graph).to.be.an 'object'
        instance = graph
        done()
    it 'should have a reference to the Component Loader\'s baseDir', ->
      chai.expect(instance.baseDir).to.equal l.baseDir
