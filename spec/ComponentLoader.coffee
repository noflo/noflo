if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  shippingLanguage = 'coffeescript'
  path = require 'path'
  root = path.resolve __dirname, '../'
  urlPrefix = './'
else
  noflo = require 'noflo'
  shippingLanguage = 'javascript'
  root = 'noflo'
  urlPrefix = '/'

describe 'ComponentLoader with no external packages installed', ->
  l = new noflo.ComponentLoader root
  class Split extends noflo.Component
    constructor: ->
      options =
        inPorts:
          in: {}
        outPorts:
          out: {}
        process: (input, output) ->
          output.sendDone input.get 'in'
      super options
  Split.getComponent = -> new Split

  Merge = ->
    inst = new noflo.Component
    inst.inPorts.add 'in'
    inst.outPorts.add 'out'
    inst.process (input, output) ->
      output.sendDone input.get 'in'
    inst

  it 'should initially know of no components', ->
    chai.expect(l.components).to.be.null
  it 'should not initially be ready', ->
    chai.expect(l.ready).to.be.false
  it 'should not initially be processing', ->
    chai.expect(l.processing).to.be.false
  it 'should not have any packages in the checked list', ->
    chai.expect(l.checked).to.not.exist

  describe 'normalizing names', ->
    it 'should return simple module names as-is', ->
      normalized = l.getModulePrefix 'foo'
      chai.expect(normalized).to.equal 'foo'
    it 'should return empty for NoFlo core', ->
      normalized = l.getModulePrefix 'noflo'
      chai.expect(normalized).to.equal ''
    it 'should strip noflo-', ->
      normalized = l.getModulePrefix 'noflo-image'
      chai.expect(normalized).to.equal 'image'
    it 'should strip NPM scopes', ->
      normalized = l.getModulePrefix '@noflo/foo'
      chai.expect(normalized).to.equal 'foo'
    it 'should strip NPM scopes and noflo-', ->
      normalized = l.getModulePrefix '@noflo/noflo-image'
      chai.expect(normalized).to.equal 'image'

  it 'should be able to read a list of components', (done) ->
    @timeout 60 * 1000
    ready = false
    l.once 'ready', ->
      ready = true
      chai.expect(l.ready, 'should have the ready bit').to.equal true
    l.listComponents (err, components) ->
      return done err if err
      chai.expect(l.processing, 'should have stopped processing').to.equal false
      chai.expect(l.components, 'should contain components').not.to.be.empty
      chai.expect(components, 'should have returned the full list').to.equal l.components
      chai.expect(l.ready, 'should have been set ready').to.equal true
      chai.expect(ready, 'should have emitted ready').to.equal true
      done()

    unless noflo.isBrowser()
      # Browser component registry can be synchronous
      chai.expect(l.processing, 'should have started processing').to.equal true

  describe 'calling listComponents twice simultaneously', ->
    it 'should return the same results', (done) ->
      loader = new noflo.ComponentLoader root
      received = []
      loader.listComponents (err, components) ->
        return done err if err
        received.push components
        return unless received.length is 2
        chai.expect(received[0]).to.equal received[1]
        done()
      loader.listComponents (err, components) ->
        return done err if err
        received.push components
        return unless received.length is 2
        chai.expect(received[0]).to.equal received[1]
        done()

  describe 'after listing components', ->
    it 'should have the Graph component registered', ->
      chai.expect(l.components.Graph).not.to.be.empty

  describe 'loading the Graph component', ->
    instance = null
    it 'should be able to load the component', (done) ->
      l.load 'Graph', (err, inst) ->
        return done err if err
        chai.expect(inst).to.be.an 'object'
        chai.expect(inst.componentName).to.equal 'Graph'
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
    it 'should be able to load the component with non-ready ComponentLoader', (done) ->
      loader = new noflo.ComponentLoader root
      loader.load 'Graph', (err, inst) ->
        return done err if err
        chai.expect(inst).to.be.an 'object'
        chai.expect(inst.componentName).to.equal 'Graph'
        instance = inst
        done()

  describe 'loading a subgraph', ->
    l = new noflo.ComponentLoader root
    file = "#{urlPrefix}spec/fixtures/subgraph.fbp"
    it 'should remove `graph` and `start` ports', (done) ->
      l.listComponents (err, components) ->
        return done err if err
        l.components.Merge = Merge
        l.components.Subgraph = file
        l.components.Split = Split
        l.load 'Subgraph', (err, inst) ->
          return done err if err
          chai.expect(inst).to.be.an 'object'
          inst.once 'ready', ->
            chai.expect(inst.inPorts.ports).not.to.have.keys ['graph','start']
            chai.expect(inst.inPorts.ports).to.have.keys ['in']
            chai.expect(inst.outPorts.ports).to.have.keys ['out']
            done()
    it 'should not automatically start the subgraph if there is no `start` port', (done) ->
      l.listComponents (err, components) ->
        return done err if err
        l.components.Merge = Merge
        l.components.Subgraph = file
        l.components.Split = Split
        l.load 'Subgraph', (err, inst) ->
          return done err if err
          chai.expect(inst).to.be.an 'object'
          inst.once 'ready', ->
            chai.expect(inst.started).to.equal(false)
            done()
    it 'should also work with a passed graph object', (done) ->
      noflo.graph.loadFile file, (err, graph) ->
        return done err if err
        l.listComponents (err, components) ->
          return done err if err
          l.components.Merge = Merge
          l.components.Subgraph = graph
          l.components.Split = Split
          l.load 'Subgraph', (err, inst) ->
            return done err if err
            chai.expect(inst).to.be.an 'object'
            inst.once 'ready', ->
              chai.expect(inst.inPorts.ports).not.to.have.keys ['graph','start']
              chai.expect(inst.inPorts.ports).to.have.keys ['in']
              chai.expect(inst.outPorts.ports).to.have.keys ['out']
              done()

  describe 'loading the Graph component', ->
    instance = null
    it 'should be able to load the component', (done) ->
      l.load 'Graph', (err, graph) ->
        return done err if err
        chai.expect(graph).to.be.an 'object'
        instance = graph
        done()
    it 'should have a reference to the Component Loader\'s baseDir', ->
      chai.expect(instance.baseDir).to.equal l.baseDir

  describe 'loading a component', ->
    loader = null
    before (done) ->
      loader = new noflo.ComponentLoader root
      loader.listComponents done
    it 'should return an error on an invalid component type', (done) ->
      loader.components['InvalidComponent'] = true
      loader.load 'InvalidComponent', (err, c) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.equal 'Invalid type boolean for component InvalidComponent.'
        done()
    it 'should return an error on a missing component path', (done) ->
      loader.components['InvalidComponent'] = 'missing-file.js'
      if noflo.isBrowser()
        str = 'Dynamic loading of'
      else
        str = 'Cannot find module'
      loader.load 'InvalidComponent', (err, c) ->
        chai.expect(err).to.be.an 'error'
        chai.expect(err.message).to.contain str
        done()

  describe 'register a component at runtime', ->
    class FooSplit extends noflo.Component
      constructor: ->
        options =
          inPorts:
            in: {}
          outPorts:
            out: {}
        super options
    FooSplit.getComponent = -> new FooSplit
    instance = null
    l.libraryIcons.foo = 'star'
    it 'should be available in the components list', ->
      l.registerComponent 'foo', 'Split', FooSplit
      chai.expect(l.components).to.contain.keys ['foo/Split', 'Graph']
    it 'should be able to load the component', (done) ->
      l.load 'foo/Split', (err, split) ->
        return done err if err
        chai.expect(split).to.be.an 'object'
        instance = split
        done()
    it 'should have the correct ports', ->
      chai.expect(instance.inPorts.ports).to.have.keys ['in']
      chai.expect(instance.outPorts.ports).to.have.keys ['out']
    it 'should have inherited its icon from the library', ->
      chai.expect(instance.getIcon()).to.equal 'star'
    it 'should emit an event on icon change', (done) ->
      instance.once 'icon', (newIcon) ->
        chai.expect(newIcon).to.equal 'smile'
        done()
      instance.setIcon 'smile'
    it 'new instances should still contain the original icon', (done) ->
      l.load 'foo/Split', (err, split) ->
        return done err if err
        chai.expect(split).to.be.an 'object'
        chai.expect(split.getIcon()).to.equal 'star'
        done()
    it 'after setting an icon for the Component class, new instances should have that', (done) ->
      FooSplit::icon = 'trophy'
      l.load 'foo/Split', (err, split) ->
        return done err if err
        chai.expect(split).to.be.an 'object'
        chai.expect(split.getIcon()).to.equal 'trophy'
        done()
    it 'should not affect the original instance', ->
      chai.expect(instance.getIcon()).to.equal 'smile'

  describe 'reading sources', ->
    before ->
      # getSource not implemented in webpack loader yet
      return @skip() if noflo.isBrowser()
    it 'should be able to provide source code for a component', (done) ->
      l.getSource 'Graph', (err, component) ->
        return done err if err
        chai.expect(component).to.be.an 'object'
        chai.expect(component.code).to.be.a 'string'
        chai.expect(component.code.indexOf('noflo.Component')).to.not.equal -1
        chai.expect(component.code.indexOf('exports.getComponent')).to.not.equal -1
        chai.expect(component.name).to.equal 'Graph'
        chai.expect(component.library).to.equal ''
        chai.expect(component.language).to.equal shippingLanguage
        done()
    it 'should return an error for missing components', (done) ->
      l.getSource 'foo/BarBaz', (err, src) ->
        chai.expect(err).to.be.an 'error'
        done()
    it 'should return an error for non-file components', (done) ->
      l.getSource 'foo/Split', (err, src) ->
        chai.expect(err).to.be.an 'error'
        done()
    it 'should be able to provide source for a graph file component', (done) ->
      file = "#{urlPrefix}spec/fixtures/subgraph.fbp"
      l.components.Subgraph = file
      l.getSource 'Subgraph', (err, src) ->
        return done err if err
        chai.expect(src.code).to.not.be.empty
        chai.expect(src.language).to.equal 'json'
        done()
    it 'should be able to provide source for a graph object component', (done) ->
      file = "#{urlPrefix}spec/fixtures/subgraph.fbp"
      noflo.graph.loadFile file, (err, graph) ->
        return done err if err
        l.components.Subgraph2 = graph
        l.getSource 'Subgraph2', (err, src) ->
          return done err if err
          chai.expect(src.code).to.not.be.empty
          chai.expect(src.language).to.equal 'json'
          done()
    it 'should be able to get the source for non-ready ComponentLoader', (done) ->
      loader = new noflo.ComponentLoader root
      loader.getSource 'Graph', (err, component) ->
        return done err if err
        chai.expect(component).to.be.an 'object'
        chai.expect(component.code).to.be.a 'string'
        chai.expect(component.code.indexOf('noflo.Component')).to.not.equal -1
        chai.expect(component.code.indexOf('exports.getComponent')).to.not.equal -1
        chai.expect(component.name).to.equal 'Graph'
        chai.expect(component.library).to.equal ''
        chai.expect(component.language).to.equal shippingLanguage
        done()

  describe 'writing sources', ->
    describe 'with working code', ->
      describe 'with ES5', ->
        workingSource = """
        var noflo = require('noflo');

        exports.getComponent = function() {
          var c = new noflo.Component();
          c.inPorts.add('in');
          c.outPorts.add('out');
          c.process(function (input, output) {
            output.sendDone(input.get('in'));
          });
          return c;
        };"""

        it 'should be able to set the source', (done) ->
          @timeout 10000
          unless noflo.isBrowser()
            workingSource = workingSource.replace "'noflo'", "'../src/lib/NoFlo'"
          l.setSource 'foo', 'RepeatData', workingSource, 'javascript', (err) ->
            return done err if err
            done()
        it 'should be a loadable component', (done) ->
          l.load 'foo/RepeatData', (err, inst) ->
            return done err if err
            chai.expect(inst).to.be.an 'object'
            chai.expect(inst.inPorts).to.contain.keys ['in']
            chai.expect(inst.outPorts).to.contain.keys ['out']
            ins = new noflo.internalSocket.InternalSocket
            out = new noflo.internalSocket.InternalSocket
            inst.inPorts.in.attach ins
            inst.outPorts.out.attach out
            out.on 'ip', (ip) ->
              chai.expect(ip.type).to.equal 'data'
              chai.expect(ip.data).to.equal 'ES5'
              done()
            ins.send 'ES5'
        it 'should be able to set the source for non-ready ComponentLoader', (done) ->
          @timeout 10000
          loader = new noflo.ComponentLoader root
          loader.setSource 'foo', 'RepeatData', workingSource, 'javascript', done
      describe 'with ES6', ->
        before ->
          # PhantomJS doesn't work with ES6
          return @skip() if noflo.isBrowser()
        workingSource = """
        const noflo = require('noflo');

        exports.getComponent = () => {
          const c = new noflo.Component();
          c.inPorts.add('in');
          c.outPorts.add('out');
          c.process((input, output) => {
            output.sendDone(input.get('in'));
          });
          return c;
        };"""

        it 'should be able to set the source', (done) ->
          @timeout 10000
          unless noflo.isBrowser()
            workingSource = workingSource.replace "'noflo'", "'../src/lib/NoFlo'"
          l.setSource 'foo', 'RepeatDataES6', workingSource, 'es6', (err) ->
            return done err if err
            done()
        it 'should be a loadable component', (done) ->
          l.load 'foo/RepeatDataES6', (err, inst) ->
            return done err if err
            chai.expect(inst).to.be.an 'object'
            chai.expect(inst.inPorts).to.contain.keys ['in']
            chai.expect(inst.outPorts).to.contain.keys ['out']
            ins = new noflo.internalSocket.InternalSocket
            out = new noflo.internalSocket.InternalSocket
            inst.inPorts.in.attach ins
            inst.outPorts.out.attach out
            out.on 'ip', (ip) ->
              chai.expect(ip.type).to.equal 'data'
              chai.expect(ip.data).to.equal 'ES6'
              done()
            ins.send 'ES6'
      describe 'with CoffeeScript', ->
        before ->
          # CoffeeScript tests work in browser only if we have CoffeeScript
          # compiler loaded
          return @skip() if noflo.isBrowser() and not window.CoffeeScript
        workingSource = """
        noflo = require 'noflo'
        exports.getComponent = ->
          c = new noflo.Component
          c.inPorts.add 'in'
          c.outPorts.add 'out'
          c.process (input, output) ->
            output.sendDone input.get 'in'
        """

        it 'should be able to set the source', (done) ->
          @timeout 10000
          unless noflo.isBrowser()
            workingSource = workingSource.replace "'noflo'", "'../src/lib/NoFlo'"
          l.setSource 'foo', 'RepeatDataCoffee', workingSource, 'coffeescript', (err) ->
            return done err if err
            done()
        it 'should be a loadable component', (done) ->
          l.load 'foo/RepeatDataCoffee', (err, inst) ->
            return done err if err
            chai.expect(inst).to.be.an 'object'
            chai.expect(inst.inPorts).to.contain.keys ['in']
            chai.expect(inst.outPorts).to.contain.keys ['out']
            ins = new noflo.internalSocket.InternalSocket
            out = new noflo.internalSocket.InternalSocket
            inst.inPorts.in.attach ins
            inst.outPorts.out.attach out
            out.on 'ip', (ip) ->
              chai.expect(ip.type).to.equal 'data'
              chai.expect(ip.data).to.equal 'CoffeeScript'
              done()
            ins.send 'CoffeeScript'

    describe 'with non-working code', ->
      describe 'without exports', ->
        nonWorkingSource = """
        var noflo = require('noflo');
        var getComponent = function() {
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

        it 'should not be able to set the source', (done) ->
          unless noflo.isBrowser()
            nonWorkingSource = nonWorkingSource.replace "'noflo'", "'../src/lib/NoFlo'"
          l.setSource 'foo', 'NotWorking', nonWorkingSource, 'js', (err) ->
            chai.expect(err).to.be.an 'error'
            chai.expect(err.message).to.contain 'runnable component'
            done()
        it 'should not be a loadable component', (done) ->
          l.load 'foo/NotWorking', (err, inst) ->
            chai.expect(err).to.be.an 'error'
            chai.expect(inst).to.be.an 'undefined'
            done()
      describe 'with non-existing import', ->
        nonWorkingSource = """
        var noflo = require('noflo');
        var notFound = require('./this_file_does_not_exist.js');

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

        it 'should not be able to set the source', (done) ->
          unless noflo.isBrowser()
            nonWorkingSource = nonWorkingSource.replace "'noflo'", "'../src/lib/NoFlo'"
          l.setSource 'foo', 'NotWorking', nonWorkingSource, 'js', (err) ->
            chai.expect(err).to.be.an 'error'
            done()
        it 'should not be a loadable component', (done) ->
          l.load 'foo/NotWorking', (err, inst) ->
            chai.expect(err).to.be.an 'error'
            chai.expect(inst).to.be.an 'undefined'
            done()
      describe 'with deprecated process callback', ->
        nonWorkingSource = """
        var noflo = require('noflo');
        exports.getComponent = function() {
          var c = new noflo.Component();

          c.inPorts.add('in', {
            process: function(packet, outPorts) {
              if (packet.event !== 'data') {
                return;
              }
              // Do something with the packet, then
              c.outPorts.out.send(packet.data);
            }
          });

          c.outPorts.add('out');

          return c;
        };"""

        it 'should be able to set the source', (done) ->
          unless noflo.isBrowser()
            nonWorkingSource = nonWorkingSource.replace "'noflo'", "'../src/lib/NoFlo'"
          l.setSource 'foo', 'NotWorkingProcess', nonWorkingSource, 'js', done
        it 'should not be a loadable component', (done) ->
          l.load 'foo/NotWorkingProcess', (err, inst) ->
            chai.expect(err).to.be.an 'error'
            chai.expect(err.message).to.contain 'process callback is deprecated'
            chai.expect(inst).to.be.an 'undefined'
            done()

describe 'ComponentLoader with a fixture project', ->
  l = null
  before ->
    return @skip() if noflo.isBrowser()
  it 'should be possible to instantiate', ->
    l = new noflo.ComponentLoader path.resolve __dirname, 'fixtures/componentloader'
  it 'should initially know of no components', ->
    chai.expect(l.components).to.be.a 'null'
  it 'should not initially be ready', ->
    chai.expect(l.ready).to.be.false
  it 'should be able to read a list of components', (done) ->
    ready = false
    l.once 'ready', ->
      chai.expect(l.ready).to.equal true
      ready = l.ready
    l.listComponents (err, components) ->
      return done err if err
      chai.expect(l.processing).to.equal false
      chai.expect(l.components).not.to.be.empty
      chai.expect(components).to.equal l.components
      chai.expect(l.ready).to.equal true
      chai.expect(ready).to.equal true
      done()
    chai.expect(l.processing).to.equal true
  it 'should be able to load a local component', (done) ->
    l.load 'componentloader/Output', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.description).to.equal 'Output stuff'
      chai.expect(instance.icon).to.equal 'cloud'
      done()
  it 'should be able to load a component from a dependency', (done) ->
    l.load 'example/Forward', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.description).to.equal 'Forward stuff'
      chai.expect(instance.icon).to.equal 'car'
      done()
  it 'should be able to load a dynamically registered component from a dependency', (done) ->
    l.load 'example/Hello', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.description).to.equal 'Hello stuff'
      chai.expect(instance.icon).to.equal 'bicycle'
      done()
  it 'should be able to load core Graph component', (done) ->
    l.load 'Graph', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.icon).to.equal 'sitemap'
      done()
  it 'should fail loading a missing component', (done) ->
    l.load 'componentloader/Missing', (err, instance) ->
      chai.expect(err).to.be.an 'error'
      done()

describe 'ComponentLoader with a fixture project and caching', ->
  l = null
  fixtureRoot = null
  before ->
    return @skip() if noflo.isBrowser()
    fixtureRoot = path.resolve __dirname, 'fixtures/componentloader'
  after (done) ->
    return done() if noflo.isBrowser()
    manifestPath = path.resolve fixtureRoot, 'fbp.json'
    { unlink } = require 'fs'
    unlink manifestPath, done
  it 'should be possible to pre-heat the cache file', (done) ->
    @timeout 8000
    { exec } = require 'child_process'
    exec "node #{path.resolve(__dirname, '../bin/noflo-cache-preheat')}",
      cwd: fixtureRoot
    , done
  it 'should have populated a fbp-manifest file', (done) ->
    manifestPath = path.resolve fixtureRoot, 'fbp.json'
    { stat } = require 'fs'
    stat manifestPath, (err, stats) ->
      return done err if err
      chai.expect(stats.isFile()).to.equal true
      done()
  it 'should be possible to instantiate', ->
    l = new noflo.ComponentLoader fixtureRoot,
      cache: true
  it 'should initially know of no components', ->
    chai.expect(l.components).to.be.a 'null'
  it 'should not initially be ready', ->
    chai.expect(l.ready).to.be.false
  it 'should be able to read a list of components', (done) ->
    ready = false
    l.once 'ready', ->
      chai.expect(l.ready).to.equal true
      ready = l.ready
    l.listComponents (err, components) ->
      return done err if err
      chai.expect(l.processing).to.equal false
      chai.expect(l.components).not.to.be.empty
      chai.expect(components).to.equal l.components
      chai.expect(l.ready).to.equal true
      chai.expect(ready).to.equal true
      done()
    chai.expect(l.processing).to.equal true
  it 'should be able to load a local component', (done) ->
    l.load 'componentloader/Output', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.description).to.equal 'Output stuff'
      chai.expect(instance.icon).to.equal 'cloud'
      done()
  it 'should be able to load a component from a dependency', (done) ->
    l.load 'example/Forward', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.description).to.equal 'Forward stuff'
      chai.expect(instance.icon).to.equal 'car'
      done()
  it 'should be able to load a dynamically registered component from a dependency', (done) ->
    l.load 'example/Hello', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.description).to.equal 'Hello stuff'
      chai.expect(instance.icon).to.equal 'bicycle'
      done()
  it 'should be able to load core Graph component', (done) ->
    l.load 'Graph', (err, instance) ->
      chai.expect(err).to.be.a 'null'
      chai.expect(instance.icon).to.equal 'sitemap'
      done()
  it 'should fail loading a missing component', (done) ->
    l.load 'componentloader/Missing', (err, instance) ->
      chai.expect(err).to.be.an 'error'
      done()
  it 'should fail with missing manifest without discover option', (done) ->
    l = new noflo.ComponentLoader fixtureRoot,
      cache: true
      discover: false
      manifest: 'fbp2.json'
    l.listComponents (err) ->
      chai.expect(err).to.be.an 'error'
      done()
  it 'should be able to use a custom manifest file', (done) ->
    @timeout 8000
    manifestPath = path.resolve fixtureRoot, 'fbp2.json'
    l = new noflo.ComponentLoader fixtureRoot,
      cache: true
      discover: true
      manifest: 'fbp2.json'
    l.listComponents (err, components) ->
      return done err if err
      chai.expect(l.processing).to.equal false
      chai.expect(l.components).not.to.be.empty
      done()
  it 'should have saved the new manifest', (done) ->
    manifestPath = path.resolve fixtureRoot, 'fbp2.json'
    { unlink } = require 'fs'
    unlink manifestPath, done
