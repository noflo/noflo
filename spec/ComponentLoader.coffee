if typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1
  chai = require 'chai' unless chai
  loader = require '../src/lib/nodejs/ComponentLoader.coffee'
  component = require '../src/lib/Component.coffee'
  port = require '../src/lib/Port.coffee'
  platform = require '../src/lib/Platform.coffee'
  path = require 'path'
  root = path.resolve __dirname, '../'
else
  loader = require 'noflo/src/lib/ComponentLoader.js'
  component = require 'noflo/src/lib/Component.js'
  platform = require 'noflo/src/lib/Platform.js'
  root = 'noflo'

describe 'ComponentLoader with no external packages installed', ->
  l = new loader.ComponentLoader root

  it 'should initially know of no components', ->
    chai.expect(l.components).to.be.null
  it 'should not initially require revalidation', ->
    chai.expect(l.revalidate).to.be.false
  it 'should not initially be ready', ->
    chai.expect(l.ready).to.be.false
  it 'should not initially be processing', ->
    chai.expect(l.processing).to.be.false
  it 'should not have any packages in the checked list', ->
    chai.expect(l.checked).to.be.empty

  it 'should be able to read a list of components', (done) ->
    ready = false
    l.once 'ready', ->
      ready = true
      chai.expect(l.ready).to.equal true
    l.listComponents (components) ->
      chai.expect(l.processing).to.equal false
      chai.expect(l.components).not.to.be.empty
      chai.expect(components).to.equal l.components
      chai.expect(l.ready).to.equal true
      chai.expect(ready).to.equal true
      done()
    chai.expect(l.processing).to.equal true

  describe 'after listing components', ->
    it 'should have the Graph component registered', ->
      chai.expect(l.components.Graph).not.to.be.empty

  describe 'loading the Graph component', ->
    instance = null
    it 'should be able to load the component', (done) ->
      l.load 'Graph', (inst) ->
        chai.expect(inst).to.be.an 'object'
        instance = inst
        done()
    it 'should contain input ports', ->
      chai.expect(instance.inPorts).to.be.an 'object'
      chai.expect(instance.inPorts.graph).to.be.an 'object'
    it 'should have "on" method on the input port', ->
      chai.expect(instance.inPorts.graph.on).to.be.a 'function'
    it 'it should know that Graph is a subgraph', ->
      chai.expect(instance.isSubgraph()).to.equal true
    it 'should know the description for the Graph', ->
      chai.expect(instance.description).to.be.a 'string'
    it 'should be able to provide an icon for the Graph', ->
      chai.expect(instance.getIcon()).to.be.a 'string'
      chai.expect(instance.getIcon()).to.equal 'sitemap'

  describe 'loading the Graph component', ->
    instance = null
    it 'should be able to load the component', (done) ->
      l.load 'Graph', (graph) ->
        chai.expect(graph).to.be.an 'object'
        instance = graph
        done()
    it 'should have a reference to the Component Loader\'s baseDir', ->
      chai.expect(instance.baseDir).to.equal l.baseDir

  describe 'register a component at runtime', ->
    class Split extends component.Component
      constructor: ->
        @inPorts =
          in: new port.Port
        @outPorts =
          out: new port.Port
    Split.getComponent = -> new Split
    instance = null
    l.libraryIcons.foo = 'star'
    it 'should be available in the components list', ->
      l.registerComponent 'foo', 'Split', Split
      chai.expect(l.components).to.contain.keys ['foo/Split', 'Graph']
    it 'should be able to load the component', (done) ->
      l.load 'foo/Split', (split) ->
        chai.expect(split).to.be.an 'object'
        instance = split
        done()
    it 'should have the correct ports', ->
      chai.expect(instance.inPorts).to.have.keys ['in']
      chai.expect(instance.outPorts).to.have.keys ['out']
    it 'should have inherited its icon from the library', ->
      chai.expect(instance.getIcon()).to.equal 'star'
    it 'should emit an event on icon change', (done) ->
      instance.once 'icon', (newIcon) ->
        chai.expect(newIcon).to.equal 'smile'
        done()
      instance.setIcon 'smile'
    it 'new instances should still contain the original icon', (done) ->
      l.load 'foo/Split', (split) ->
        chai.expect(split).to.be.an 'object'
        chai.expect(split.getIcon()).to.equal 'star'
        done()
    it 'after setting an icon for the Component class, new instances should have that', (done) ->
      Split::icon = 'trophy'
      l.load 'foo/Split', (split) ->
        chai.expect(split).to.be.an 'object'
        chai.expect(split.getIcon()).to.equal 'trophy'
        done()
    it 'should not affect the original instance', ->
      chai.expect(instance.getIcon()).to.equal 'smile'

  describe 'reading sources', ->
    it 'should be able to provide source code for a component', (done) ->
      l.getSource 'Graph', (err, component) ->
        chai.expect(err).to.be.a 'null'
        chai.expect(component).to.be.an 'object'
        chai.expect(component.code).to.be.a 'string'
        chai.expect(component.code.indexOf('noflo.Component')).to.not.equal -1
        chai.expect(component.code.indexOf('exports.getComponent')).to.not.equal -1
        chai.expect(component.name).to.equal 'Graph'
        chai.expect(component.library).to.equal ''
        done()
    it 'should return an error for missing components', (done) ->
      l.getSource 'foo/BarBaz', (err, src) ->
        chai.expect(err).to.be.an 'object'
        done()
    it 'should return an error for non-file components', (done) ->
      l.getSource 'foo/Split', (err, src) ->
        chai.expect(err).to.be.an 'object'
        done()

  describe 'writing sources', ->
    workingSource = """
    var noflo = require('noflo');

    exports.getComponent = function() {
      var c = new noflo.Component();

      c.inPorts.add('in', function(packet, outPorts) {
        if (packet.event !== 'data') {
          return;
        }
        // Do something with the packet, then
        c.outPorts.out.send(packet.data);
      });

      c.outPorts.add('out');

      return c;
    };"""

    it 'should be able to set the source', (done) ->
      unless platform.isBrowser()
        workingSource = workingSource.replace "'noflo'", "'./src/lib/NoFlo'"
      l.setSource 'foo', 'RepeatData', workingSource, 'js', (err) ->
        throw err if err
        chai.expect(err).to.be.a 'null'
        done()
    it 'should be a loadable component', (done) ->
      l.load 'foo/RepeatData', (inst) ->
        chai.expect(inst).to.be.an 'object'
        chai.expect(inst.inPorts).to.contain.keys ['in']
        chai.expect(inst.outPorts).to.contain.keys ['out']
        done()
