/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let chai, noflo, path, root, shippingLanguage, urlPrefix;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { chai = require('chai'); }
  noflo = require('../src/lib/NoFlo');
  shippingLanguage = 'javascript';
  path = require('path');
  root = path.resolve(__dirname, '../');
  urlPrefix = './';
} else {
  noflo = require('noflo');
  shippingLanguage = 'javascript';
  root = 'noflo';
  urlPrefix = '/';
}

describe('ComponentLoader with no external packages installed', function() {
  let l = new noflo.ComponentLoader(root);
  class Split extends noflo.Component {
    constructor() {
      const options = {
        inPorts: {
          in: {}
        },
        outPorts: {
          out: {}
        },
        process(input, output) {
          output.sendDone(input.get('in'));
        }
      };
      super(options);
    }
  }
  Split.getComponent = () => new Split;

  const Merge = function() {
    const inst = new noflo.Component;
    inst.inPorts.add('in');
    inst.outPorts.add('out');
    inst.process((input, output) => output.sendDone(input.get('in')));
    return inst;
  };

  it('should initially know of no components', function() {
    chai.expect(l.components).to.be.null;
  });
  it('should not initially be ready', function() {
    chai.expect(l.ready).to.be.false;
  });
  it('should not initially be processing', function() {
    chai.expect(l.processing).to.be.false;
  });
  it('should not have any packages in the checked list', function() {
    chai.expect(l.checked).to.not.exist;

  });
  describe('normalizing names', function() {
    it('should return simple module names as-is', function() {
      const normalized = l.getModulePrefix('foo');
      chai.expect(normalized).to.equal('foo');
    });
    it('should return empty for NoFlo core', function() {
      const normalized = l.getModulePrefix('noflo');
      chai.expect(normalized).to.equal('');
    });
    it('should strip noflo-', function() {
      const normalized = l.getModulePrefix('noflo-image');
      chai.expect(normalized).to.equal('image');
    });
    it('should strip NPM scopes', function() {
      const normalized = l.getModulePrefix('@noflo/foo');
      chai.expect(normalized).to.equal('foo');
    });
    it('should strip NPM scopes and noflo-', function() {
      const normalized = l.getModulePrefix('@noflo/noflo-image');
      chai.expect(normalized).to.equal('image');
    });
  });
  it('should be able to read a list of components', function(done) {
    this.timeout(60 * 1000);
    let ready = false;
    l.once('ready', function() {
      ready = true;
      chai.expect(l.ready, 'should have the ready bit').to.equal(true);
    });
    l.listComponents(function(err, components) {
      if (err) {
        done(err);
        return;
      }
      chai.expect(l.processing, 'should have stopped processing').to.equal(false);
      chai.expect(l.components, 'should contain components').not.to.be.empty;
      chai.expect(components, 'should have returned the full list').to.equal(l.components);
      chai.expect(l.ready, 'should have been set ready').to.equal(true);
      chai.expect(ready, 'should have emitted ready').to.equal(true);
      done();
    });

    if (!noflo.isBrowser()) {
      // Browser component registry can be synchronous
      chai.expect(l.processing, 'should have started processing').to.equal(true);
    }

  });
  describe('calling listComponents twice simultaneously', function() {
    it('should return the same results', function(done) {
      const loader = new noflo.ComponentLoader(root);
      const received = [];
      loader.listComponents(function(err, components) {
        if (err) {
          done(err);
          return;
        }
        received.push(components);
        if (received.length !== 2) { return; }
        chai.expect(received[0]).to.equal(received[1]);
        done();
      });
      loader.listComponents(function(err, components) {
        if (err) {
          done(err);
          return;
        }
        received.push(components);
        if (received.length !== 2) { return; }
        chai.expect(received[0]).to.equal(received[1]);
        done();
      });
    });
  });
  describe('after listing components', function() {
    it('should have the Graph component registered', function() {
      chai.expect(l.components.Graph).not.to.be.empty;
    });

  });
  describe('loading the Graph component', function() {
    let instance = null;
    it('should be able to load the component', function(done) {
      l.load('Graph', function(err, inst) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(inst).to.be.an('object');
        chai.expect(inst.componentName).to.equal('Graph');
        instance = inst;
        done();
      });
    });
    it('should contain input ports', function() {
      chai.expect(instance.inPorts).to.be.an('object');
      chai.expect(instance.inPorts.graph).to.be.an('object');
    });
    it('should have "on" method on the input port', function() {
      chai.expect(instance.inPorts.graph.on).to.be.a('function');
    });
    it('it should know that Graph is a subgraph', function() {
      chai.expect(instance.isSubgraph()).to.equal(true);
    });
    it('should know the description for the Graph', function() {
      chai.expect(instance.getDescription()).to.be.a('string');
    });
    it('should be able to provide an icon for the Graph', function() {
      chai.expect(instance.getIcon()).to.be.a('string');
      chai.expect(instance.getIcon()).to.equal('sitemap');
    });
    it('should be able to load the component with non-ready ComponentLoader', function(done) {
      const loader = new noflo.ComponentLoader(root);
      loader.load('Graph', function(err, inst) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(inst).to.be.an('object');
        chai.expect(inst.componentName).to.equal('Graph');
        instance = inst;
        done();
      });
    });
  });

  describe('loading a subgraph', function() {
    l = new noflo.ComponentLoader(root);
    const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
    it('should remove `graph` and `start` ports', function(done) {
      l.listComponents(function(err, components) {
        if (err) {
          done(err);
          return;
        }
        l.components.Merge = Merge;
        l.components.Subgraph = file;
        l.components.Split = Split;
        l.load('Subgraph', function(err, inst) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(inst).to.be.an('object');
          inst.once('ready', function() {
            chai.expect(inst.inPorts.ports).not.to.have.keys(['graph','start']);
            chai.expect(inst.inPorts.ports).to.have.keys(['in']);
            chai.expect(inst.outPorts.ports).to.have.keys(['out']);
            done();
          });
        });
      });
    });
    it('should not automatically start the subgraph if there is no `start` port', function(done) {
      l.listComponents(function(err, components) {
        if (err) {
          done(err);
          return;
        }
        l.components.Merge = Merge;
        l.components.Subgraph = file;
        l.components.Split = Split;
        l.load('Subgraph', function(err, inst) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(inst).to.be.an('object');
          inst.once('ready', function() {
            chai.expect(inst.started).to.equal(false);
            done();
          });
        });
      });
    });
    it('should also work with a passed graph object', function(done) {
      noflo.graph.loadFile(file, function(err, graph) {
        if (err) {
          done(err);
          return;
        }
        l.listComponents(function(err, components) {
          if (err) {
            done(err);
            return;
          }
          l.components.Merge = Merge;
          l.components.Subgraph = graph;
          l.components.Split = Split;
          l.load('Subgraph', function(err, inst) {
            if (err) {
              done(err);
              return;
            }
            chai.expect(inst).to.be.an('object');
            inst.once('ready', function() {
              chai.expect(inst.inPorts.ports).not.to.have.keys(['graph','start']);
              chai.expect(inst.inPorts.ports).to.have.keys(['in']);
              chai.expect(inst.outPorts.ports).to.have.keys(['out']);
              done();
            });
          });
        });
      });
    });
  });
  describe('loading the Graph component', function() {
    let instance = null;
    it('should be able to load the component', function(done) {
      l.load('Graph', function(err, graph) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(graph).to.be.an('object');
        instance = graph;
        done();
      });
    });
    it('should have a reference to the Component Loader\'s baseDir', function() {
      chai.expect(instance.baseDir).to.equal(l.baseDir);
    });
  });
  describe('loading a component', function() {
    let loader = null;
    before(function(done) {
      loader = new noflo.ComponentLoader(root);
      loader.listComponents(done);
    });
    it('should return an error on an invalid component type', function(done) {
      loader.components['InvalidComponent'] = true;
      loader.load('InvalidComponent', function(err, c) {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.equal('Invalid type boolean for component InvalidComponent.');
        done();
      });
    });
    it('should return an error on a missing component path', function(done) {
      let str;
      loader.components['InvalidComponent'] = 'missing-file.js';
      if (noflo.isBrowser()) {
        str = 'Dynamic loading of';
      } else {
        str = 'Cannot find module';
      }
      loader.load('InvalidComponent', function(err, c) {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain(str);
        done();
      });
    });
  });
  describe('register a component at runtime', function() {
    class FooSplit extends noflo.Component {
      constructor() {
        const options = {
          inPorts: {
            in: {}
          },
          outPorts: {
            out: {}
          }
        };
        super(options);
      }
    }
    FooSplit.getComponent = () => new FooSplit;
    let instance = null;
    l.libraryIcons.foo = 'star';
    it('should be available in the components list', function() {
      l.registerComponent('foo', 'Split', FooSplit);
      chai.expect(l.components).to.contain.keys(['foo/Split', 'Graph']);
    });
    it('should be able to load the component', function(done) {
      l.load('foo/Split', function(err, split) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(split).to.be.an('object');
        instance = split;
        done();
      });
    });
    it('should have the correct ports', function() {
      chai.expect(instance.inPorts.ports).to.have.keys(['in']);
      chai.expect(instance.outPorts.ports).to.have.keys(['out']);
    });
    it('should have inherited its icon from the library', function() {
      chai.expect(instance.getIcon()).to.equal('star');
    });
    it('should emit an event on icon change', function(done) {
      instance.once('icon', function(newIcon) {
        chai.expect(newIcon).to.equal('smile');
        done();
      });
      instance.setIcon('smile');
    });
    it('new instances should still contain the original icon', function(done) {
      l.load('foo/Split', function(err, split) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(split).to.be.an('object');
        chai.expect(split.getIcon()).to.equal('star');
        done();
      });
    });
    // TODO reconsider this test after full decaffeination
    it.skip('after setting an icon for the Component class, new instances should have that', function(done) {
      FooSplit.prototype.icon = 'trophy';
      l.load('foo/Split', function(err, split) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(split).to.be.an('object');
        chai.expect(split.getIcon()).to.equal('trophy');
        done();
      });
    });
    it('should not affect the original instance', function() {
      chai.expect(instance.getIcon()).to.equal('smile');
    });
  });
  describe('reading sources', function() {
    before(function() {
      // getSource not implemented in webpack loader yet
      if (noflo.isBrowser()) {
        this.skip();
        return;
      }
    });
    it('should be able to provide source code for a component', function(done) {
      l.getSource('Graph', function(err, component) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(component).to.be.an('object');
        chai.expect(component.code).to.be.a('string');
        chai.expect(component.code.indexOf('noflo.Component')).to.not.equal(-1);
        chai.expect(component.code.indexOf('exports.getComponent')).to.not.equal(-1);
        chai.expect(component.name).to.equal('Graph');
        chai.expect(component.library).to.equal('');
        chai.expect(component.language).to.equal(shippingLanguage);
        done();
      });
    });
    it('should return an error for missing components', function(done) {
      l.getSource('foo/BarBaz', function(err, src) {
        chai.expect(err).to.be.an('error');
        done();
      });
    });
    it('should return an error for non-file components', function(done) {
      l.getSource('foo/Split', function(err, src) {
        chai.expect(err).to.be.an('error');
        done();
      });
    });
    it('should be able to provide source for a graph file component', function(done) {
      const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
      l.components.Subgraph = file;
      l.getSource('Subgraph', function(err, src) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(src.code).to.not.be.empty;
        chai.expect(src.language).to.equal('json');
        done();
      });
    });
    it('should be able to provide source for a graph object component', function(done) {
      const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
      noflo.graph.loadFile(file, function(err, graph) {
        if (err) {
          done(err);
          return;
        }
        l.components.Subgraph2 = graph;
        l.getSource('Subgraph2', function(err, src) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(src.code).to.not.be.empty;
          chai.expect(src.language).to.equal('json');
          done();
        });
      });
    });
    it('should be able to get the source for non-ready ComponentLoader', function(done) {
      const loader = new noflo.ComponentLoader(root);
      loader.getSource('Graph', function(err, component) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(component).to.be.an('object');
        chai.expect(component.code).to.be.a('string');
        chai.expect(component.code.indexOf('noflo.Component')).to.not.equal(-1);
        chai.expect(component.code.indexOf('exports.getComponent')).to.not.equal(-1);
        chai.expect(component.name).to.equal('Graph');
        chai.expect(component.library).to.equal('');
        chai.expect(component.language).to.equal(shippingLanguage);
        done();
      });
    });
  });
  describe('writing sources', function() {
    describe('with working code', function() {
      describe('with ES5', function() {
        let workingSource = `\
var noflo = require('noflo');

exports.getComponent = function() {
  var c = new noflo.Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process(function (input, output) {
    output.sendDone(input.get('in'));
  });
  return c;
};`;

        it('should be able to set the source', function(done) {
          this.timeout(10000);
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", "'../src/lib/NoFlo'");
          }
          l.setSource('foo', 'RepeatData', workingSource, 'javascript', function(err) {
            if (err) {
              done(err);
              return;
            }
            done();
          });
        });
        it('should be a loadable component', function(done) {
          l.load('foo/RepeatData', function(err, inst) {
            if (err) {
              done(err);
              return;
            }
            chai.expect(inst).to.be.an('object');
            chai.expect(inst.inPorts).to.contain.keys(['in']);
            chai.expect(inst.outPorts).to.contain.keys(['out']);
            const ins = new noflo.internalSocket.InternalSocket;
            const out = new noflo.internalSocket.InternalSocket;
            inst.inPorts.in.attach(ins);
            inst.outPorts.out.attach(out);
            out.on('ip', function(ip) {
              chai.expect(ip.type).to.equal('data');
              chai.expect(ip.data).to.equal('ES5');
              done();
            });
            ins.send('ES5');
          });
        });
        it('should be able to set the source for non-ready ComponentLoader', function(done) {
          this.timeout(10000);
          const loader = new noflo.ComponentLoader(root);
          loader.setSource('foo', 'RepeatData', workingSource, 'javascript', done);
        });
      });
      describe('with ES6', function() {
        before(function() {
          // PhantomJS doesn't work with ES6
          if (noflo.isBrowser()) {
            this.skip();
            return;
          }
        });
        let workingSource = `\
const noflo = require('noflo');

exports.getComponent = () => {
  const c = new noflo.Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process((input, output) => {
    output.sendDone(input.get('in'));
  });
  return c;
};`;

        it('should be able to set the source', function(done) {
          this.timeout(10000);
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", "'../src/lib/NoFlo'");
          }
          l.setSource('foo', 'RepeatDataES6', workingSource, 'es6', function(err) {
            if (err) {
              done(err);
              return;
            }
            done();
          });
        });
        it('should be a loadable component', function(done) {
          l.load('foo/RepeatDataES6', function(err, inst) {
            if (err) {
              done(err);
              return;
            }
            chai.expect(inst).to.be.an('object');
            chai.expect(inst.inPorts).to.contain.keys(['in']);
            chai.expect(inst.outPorts).to.contain.keys(['out']);
            const ins = new noflo.internalSocket.InternalSocket;
            const out = new noflo.internalSocket.InternalSocket;
            inst.inPorts.in.attach(ins);
            inst.outPorts.out.attach(out);
            out.on('ip', function(ip) {
              chai.expect(ip.type).to.equal('data');
              chai.expect(ip.data).to.equal('ES6');
              done();
            });
            ins.send('ES6');
          });
        });
      });
      describe('with CoffeeScript', function() {
        before(function() {
          // CoffeeScript tests work in browser only if we have CoffeeScript
          // compiler loaded
          if (noflo.isBrowser() && !window.CoffeeScript) {
            this.skip();
          }
        });
        let workingSource = `\
noflo = require 'noflo'
exports.getComponent = ->
  c = new noflo.Component
  c.inPorts.add 'in'
  c.outPorts.add 'out'
  c.process (input, output) ->
    output.sendDone input.get 'in'\
`;

        it('should be able to set the source', function(done) {
          this.timeout(10000);
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", "'../src/lib/NoFlo'");
          }
          l.setSource('foo', 'RepeatDataCoffee', workingSource, 'coffeescript', function(err) {
            if (err) {
              done(err);
              return;
            }
            done();
          });
        });
        it('should be a loadable component', function(done) {
          l.load('foo/RepeatDataCoffee', function(err, inst) {
            if (err) {
              done(err);
              return;
            }
            chai.expect(inst).to.be.an('object');
            chai.expect(inst.inPorts).to.contain.keys(['in']);
            chai.expect(inst.outPorts).to.contain.keys(['out']);
            const ins = new noflo.internalSocket.InternalSocket;
            const out = new noflo.internalSocket.InternalSocket;
            inst.inPorts.in.attach(ins);
            inst.outPorts.out.attach(out);
            out.on('ip', function(ip) {
              chai.expect(ip.type).to.equal('data');
              chai.expect(ip.data).to.equal('CoffeeScript');
              done();
            });
            ins.send('CoffeeScript');
          });
        });
      });
    });
    describe('with non-working code', function() {
      describe('without exports', function() {
        let nonWorkingSource = `\
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
};`;

        it('should not be able to set the source', function(done) {
          if (!noflo.isBrowser()) {
            nonWorkingSource = nonWorkingSource.replace("'noflo'", "'../src/lib/NoFlo'");
          }
          l.setSource('foo', 'NotWorking', nonWorkingSource, 'js', function(err) {
            chai.expect(err).to.be.an('error');
            chai.expect(err.message).to.contain('runnable component');
            done();
          });
        });
        it('should not be a loadable component', function(done) {
          l.load('foo/NotWorking', function(err, inst) {
            chai.expect(err).to.be.an('error');
            chai.expect(inst).to.be.an('undefined');
            done();
          });
        });
      });
      describe('with non-existing import', function() {
        let nonWorkingSource = `\
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
};`;

        it('should not be able to set the source', function(done) {
          if (!noflo.isBrowser()) {
            nonWorkingSource = nonWorkingSource.replace("'noflo'", "'../src/lib/NoFlo'");
          }
          l.setSource('foo', 'NotWorking', nonWorkingSource, 'js', function(err) {
            chai.expect(err).to.be.an('error');
            done();
          });
        });
        it('should not be a loadable component', function(done) {
          l.load('foo/NotWorking', function(err, inst) {
            chai.expect(err).to.be.an('error');
            chai.expect(inst).to.be.an('undefined');
            done();
          });
        });
      });
      describe('with deprecated process callback', function() {
        let nonWorkingSource = `\
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
};`;

        it('should be able to set the source', function(done) {
          if (!noflo.isBrowser()) {
            nonWorkingSource = nonWorkingSource.replace("'noflo'", "'../src/lib/NoFlo'");
          }
          l.setSource('foo', 'NotWorkingProcess', nonWorkingSource, 'js', done);
        });
        it('should not be a loadable component', function(done) {
          l.load('foo/NotWorkingProcess', function(err, inst) {
            chai.expect(err).to.be.an('error');
            chai.expect(err.message).to.contain('process callback is deprecated');
            chai.expect(inst).to.be.an('undefined');
            done();
          });
        });
      });
    });
  });
});
describe('ComponentLoader with a fixture project', function() {
  let l = null;
  before(function() {
    if (noflo.isBrowser()) {
      this.skip();
      return;
    }
  });
  it('should be possible to instantiate', function() {
    l = new noflo.ComponentLoader(path.resolve(__dirname, 'fixtures/componentloader'));
  });
  it('should initially know of no components', function() {
    chai.expect(l.components).to.be.a('null');
  });
  it('should not initially be ready', function() {
    chai.expect(l.ready).to.be.false;
  });
  it('should be able to read a list of components', function(done) {
    let ready = false;
    l.once('ready', function() {
      chai.expect(l.ready).to.equal(true);
      ({
        ready
      } = l);
    });
    l.listComponents(function(err, components) {
      if (err) {
        done(err);
        return;
      }
      chai.expect(l.processing).to.equal(false);
      chai.expect(l.components).not.to.be.empty;
      chai.expect(components).to.equal(l.components);
      chai.expect(l.ready).to.equal(true);
      chai.expect(ready).to.equal(true);
      done();
    });
    chai.expect(l.processing).to.equal(true);
  });
  it('should be able to load a local component', function(done) {
    l.load('componentloader/Output', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.description).to.equal('Output stuff');
      chai.expect(instance.icon).to.equal('cloud');
      done();
    });
  });
  it('should be able to load a component from a dependency', function(done) {
    l.load('example/Forward', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.description).to.equal('Forward stuff');
      chai.expect(instance.icon).to.equal('car');
      done();
    });
  });
  it('should be able to load a dynamically registered component from a dependency', function(done) {
    l.load('example/Hello', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.description).to.equal('Hello stuff');
      chai.expect(instance.icon).to.equal('bicycle');
      done();
    });
  });
  it('should be able to load core Graph component', function(done) {
    l.load('Graph', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.icon).to.equal('sitemap');
      done();
    });
  });
  it('should fail loading a missing component', function(done) {
    l.load('componentloader/Missing', function(err, instance) {
      chai.expect(err).to.be.an('error');
      done();
    });
  });
});
describe('ComponentLoader with a fixture project and caching', function() {
  let l = null;
  let fixtureRoot = null;
  before(function() {
    if (noflo.isBrowser()) {
      this.skip();
      return;
    }
    fixtureRoot = path.resolve(__dirname, 'fixtures/componentloader');
  });
  after(function(done) {
    if (noflo.isBrowser()) {
      done();
      return;
    }
    const manifestPath = path.resolve(fixtureRoot, 'fbp.json');
    const { unlink } = require('fs');
    unlink(manifestPath, done);
  });
  it('should be possible to pre-heat the cache file', function(done) {
    this.timeout(8000);
    const { exec } = require('child_process');
    exec(`node ${path.resolve(__dirname, '../bin/noflo-cache-preheat')}`,
      {cwd: fixtureRoot}
    , done);
  });
  it('should have populated a fbp-manifest file', function(done) {
    const manifestPath = path.resolve(fixtureRoot, 'fbp.json');
    const { stat } = require('fs');
    stat(manifestPath, function(err, stats) {
      if (err) {
        done(err);
        return;
      }
      chai.expect(stats.isFile()).to.equal(true);
      done();
    });
  });
  it('should be possible to instantiate', function() {
    l = new noflo.ComponentLoader(fixtureRoot,
      {cache: true});
  });
  it('should initially know of no components', function() {
    chai.expect(l.components).to.be.a('null');
  });
  it('should not initially be ready', function() {
    chai.expect(l.ready).to.be.false;
  });
  it('should be able to read a list of components', function(done) {
    let ready = false;
    l.once('ready', function() {
      chai.expect(l.ready).to.equal(true);
      ({
        ready
      } = l);
    });
    l.listComponents(function(err, components) {
      if (err) {
        done(err);
        return;
      }
      chai.expect(l.processing).to.equal(false);
      chai.expect(l.components).not.to.be.empty;
      chai.expect(components).to.equal(l.components);
      chai.expect(l.ready).to.equal(true);
      chai.expect(ready).to.equal(true);
      done();
    });
    chai.expect(l.processing).to.equal(true);
  });
  it('should be able to load a local component', function(done) {
    l.load('componentloader/Output', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.description).to.equal('Output stuff');
      chai.expect(instance.icon).to.equal('cloud');
      done();
    });
  });
  it('should be able to load a component from a dependency', function(done) {
    l.load('example/Forward', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.description).to.equal('Forward stuff');
      chai.expect(instance.icon).to.equal('car');
      done();
    });
  });
  it('should be able to load a dynamically registered component from a dependency', function(done) {
    l.load('example/Hello', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.description).to.equal('Hello stuff');
      chai.expect(instance.icon).to.equal('bicycle');
      done();
    });
  });
  it('should be able to load core Graph component', function(done) {
    l.load('Graph', function(err, instance) {
      chai.expect(err).to.be.a('null');
      chai.expect(instance.icon).to.equal('sitemap');
      done();
    });
  });
  it('should fail loading a missing component', function(done) {
    l.load('componentloader/Missing', function(err, instance) {
      chai.expect(err).to.be.an('error');
      done();
    });
  });
  it('should fail with missing manifest without discover option', function(done) {
    l = new noflo.ComponentLoader(fixtureRoot, {
      cache: true,
      discover: false,
      manifest: 'fbp2.json'
    }
    );
    l.listComponents(function(err) {
      chai.expect(err).to.be.an('error');
      done();
    });
  });
  it('should be able to use a custom manifest file', function(done) {
    this.timeout(8000);
    const manifestPath = path.resolve(fixtureRoot, 'fbp2.json');
    l = new noflo.ComponentLoader(fixtureRoot, {
      cache: true,
      discover: true,
      manifest: 'fbp2.json'
    }
    );
    l.listComponents(function(err, components) {
      if (err) {
        done(err);
        return;
      }
      chai.expect(l.processing).to.equal(false);
      chai.expect(l.components).not.to.be.empty;
      done();
    });
  });
  it('should have saved the new manifest', function(done) {
    const manifestPath = path.resolve(fixtureRoot, 'fbp2.json');
    const { unlink } = require('fs');
    unlink(manifestPath, done);
  });
});