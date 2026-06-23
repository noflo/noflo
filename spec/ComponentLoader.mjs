import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import * as noflo from '../src/lib/NoFlo.js';

/* eslint-disable
  max-classes-per-file
*/
let shippingLanguage;
let urlPrefix;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  shippingLanguage = 'javascript';
  urlPrefix = './';
} else {
  shippingLanguage = 'javascript';
  urlPrefix = '/base/';
}

describe('ComponentLoader with no external packages installed', () => {
  let l = new noflo.ComponentLoader(baseDir);
  class Split extends noflo.Component {
    constructor() {
      const options = {
        inPorts: {
          in: {},
        },
        outPorts: {
          out: {},
        },
        process(input, output) {
          output.sendDone(input.get('in'));
        },
      };
      super(options);
    }
  }
  Split.getComponent = () => new Split();

  const Merge = function () {
    const inst = new noflo.Component();
    inst.inPorts.add('in');
    inst.outPorts.add('out');
    inst.process((input, output) => output.sendDone(input.get('in')));
    return inst;
  };

  it('should initially know of no components', () => {
    assert.strictEqual(l.components, null);
  });
  it('should not initially be ready', () => {
    assert.strictEqual(l.ready, false);
  });
  it('should not initially be processing', () => {
    assert.strictEqual(typeof l.processing, "null");
  });
  it('should not have any packages in the checked list', () => {
    chai.expect(l.checked).to.not.exist;
  });
  describe('normalizing names', () => {
    it('should return simple module names as-is', () => {
      const normalized = l.getModulePrefix('foo');
      assert.strictEqual(normalized, 'foo');
    });
    it('should return empty for NoFlo core', () => {
      const normalized = l.getModulePrefix('noflo');
      assert.strictEqual(normalized, '');
    });
    it('should strip noflo-', () => {
      const normalized = l.getModulePrefix('noflo-image');
      assert.strictEqual(normalized, 'image');
    });
    it('should strip NPM scopes', () => {
      const normalized = l.getModulePrefix('@noflo/foo');
      assert.strictEqual(normalized, 'foo');
    });
    it('should strip NPM scopes and noflo-', () => {
      const normalized = l.getModulePrefix('@noflo/noflo-image');
      assert.strictEqual(normalized, 'image');
    });
  });
  it('should be able to read a list of components', function (done) {
    this.timeout(60 * 1000);
    l.listComponents((err, components) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(l.processing, 'should have stopped processing', null);
      chai.expect(l.components, 'should contain components').not.to.be.empty;
      assert.strictEqual(components, 'should have returned the full list', l.components);
      assert.strictEqual(l.ready, 'should have been set ready', true);
      done();
    });

    if (!noflo.isBrowser()) {
      // Browser component registry can be synchronous
      assert.strictEqual(typeof l.processing, 'should have started processing', "promise");
    }
  });
  describe('calling listComponents twice simultaneously', () => {
    it('should return the same results', (done) => {
      const loader = new noflo.ComponentLoader(baseDir);
      const received = [];
      loader.listComponents((err, components) => {
        if (err) {
          done(err);
          return;
        }
        received.push(components);
        if (received.length !== 2) { return; }
        assert.strictEqual(received[0], received[1]);
        done();
      });
      loader.listComponents((err, components) => {
        if (err) {
          done(err);
          return;
        }
        received.push(components);
        if (received.length !== 2) { return; }
        assert.strictEqual(received[0], received[1]);
        done();
      });
    });
  });
  describe('after listing components', () => {
    it('should have the Graph component registered', () => {
      chai.expect(l.components.Graph).not.to.be.empty;
    });
  });
  describe('loading the Graph component', () => {
    let instance = null;
    it('should be able to load the component', (done) => {
      l.load('Graph', (err, inst) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof inst, "object");
        assert.strictEqual(inst.componentName, 'Graph');
        instance = inst;
        done();
      });
    });
    it('should contain input ports', () => {
      assert.strictEqual(typeof instance.inPorts, "object");
      assert.strictEqual(typeof instance.inPorts.graph, "object");
    });
    it('should have "on" method on the input port', () => {
      assert.strictEqual(typeof instance.inPorts.graph.on, "function");
    });
    it('it should know that Graph is a subgraph', () => {
      chai.expect(instance.isSubgraph()).to.equal(true);
    });
    it('should know the description for the Graph', () => {
      chai.expect(instance.getDescription()).to.be.a('string');
    });
    it('should be able to provide an icon for the Graph', () => {
      chai.expect(instance.getIcon()).to.be.a('string');
      chai.expect(instance.getIcon()).to.equal('sitemap');
    });
    it('should be able to load the component with non-ready ComponentLoader', (done) => {
      const loader = new noflo.ComponentLoader(baseDir);
      loader.load('Graph', (err, inst) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof inst, "object");
        assert.strictEqual(inst.componentName, 'Graph');
        instance = inst;
        done();
      });
    });
  });

  describe('loading a subgraph', () => {
    l = new noflo.ComponentLoader(baseDir);
    const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
    it('should remove `graph` and `start` ports', (done) => {
      l.listComponents((err) => {
        if (err) {
          done(err);
          return;
        }
        l.components.Merge = Merge;
        l.components.Subgraph = file;
        l.components.Split = Split;
        l.load('Subgraph', (err, inst) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(typeof inst, "object");
          inst.once('ready', () => {
            chai.expect(inst.inPorts.ports).not.to.have.keys(['graph', 'start']);
            chai.expect(inst.inPorts.ports).to.have.keys(['in']);
            chai.expect(inst.outPorts.ports).to.have.keys(['out']);
            done();
          });
        });
      });
    });
    it('should not automatically start the subgraph if there is no `start` port', (done) => {
      l.listComponents((err) => {
        if (err) {
          done(err);
          return;
        }
        l.components.Merge = Merge;
        l.components.Subgraph = file;
        l.components.Split = Split;
        l.load('Subgraph', (err, inst) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(typeof inst, "object");
          inst.once('ready', () => {
            assert.strictEqual(inst.started, false);
            done();
          });
        });
      });
    });
    it('should also work with a passed graph object', (done) => {
      noflo.graph.loadFile(file, (err, graph) => {
        if (err) {
          done(err);
          return;
        }
        l.listComponents((err) => {
          if (err) {
            done(err);
            return;
          }
          l.components.Merge = Merge;
          l.components.Subgraph = graph;
          l.components.Split = Split;
          l.load('Subgraph', (err, inst) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(typeof inst, "object");
            inst.once('ready', () => {
              chai.expect(inst.inPorts.ports).not.to.have.keys(['graph', 'start']);
              chai.expect(inst.inPorts.ports).to.have.keys(['in']);
              chai.expect(inst.outPorts.ports).to.have.keys(['out']);
              done();
            });
          });
        });
      });
    });
  });
  describe('loading the Graph component', () => {
    let instance = null;
    it('should be able to load the component', (done) => {
      l.load('Graph', (err, graph) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof graph, "object");
        instance = graph;
        done();
      });
    });
    it('should have a reference to the Component Loader\'s baseDir', () => {
      assert.strictEqual(instance.baseDir, l.baseDir);
    });
  });
  describe('loading a component', () => {
    let loader = null;
    before((done) => {
      loader = new noflo.ComponentLoader(baseDir);
      loader.listComponents(done);
    });
    it('should return an error on an invalid component type', (done) => {
      loader.components.InvalidComponent = true;
      loader.load('InvalidComponent', (err) => {
        assert.strictEqual(typeof err, "error");
        assert.strictEqual(err.message, 'Invalid type boolean for component InvalidComponent.');
        done();
      });
    });
    it('should return an error on a missing component path', (done) => {
      let str;
      loader.components.InvalidComponent = 'missing-file.js';
      if (noflo.isBrowser()) {
        str = 'Dynamic loading of';
      } else {
        str = 'Cannot find package';
      }
      loader.load('InvalidComponent', (err) => {
        assert.strictEqual(typeof err, "error");
        assert.ok(err.message.includes(str));
        done();
      });
    });
  });
  describe('register a component at runtime', () => {
    class FooSplit extends noflo.Component {
      constructor() {
        const options = {
          inPorts: {
            in: {},
          },
          outPorts: {
            out: {},
          },
        };
        super(options);
      }
    }
    FooSplit.getComponent = () => new FooSplit();
    let instance = null;
    l.libraryIcons.foo = 'star';
    it('should be available in the components list', () => {
      l.registerComponent('foo', 'Split', FooSplit);
      chai.expect(l.components).to.contain.keys(['foo/Split', 'Graph']);
    });
    it('should be able to load the component', (done) => {
      l.load('foo/Split', (err, split) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof split, "object");
        instance = split;
        done();
      });
    });
    it('should have the correct ports', () => {
      chai.expect(instance.inPorts.ports).to.have.keys(['in']);
      chai.expect(instance.outPorts.ports).to.have.keys(['out']);
    });
    it('should have inherited its icon from the library', () => {
      chai.expect(instance.getIcon()).to.equal('star');
    });
    it('should emit an event on icon change', (done) => {
      instance.once('icon', (newIcon) => {
        assert.strictEqual(newIcon, 'smile');
        done();
      });
      instance.setIcon('smile');
    });
    it('new instances should still contain the original icon', (done) => {
      l.load('foo/Split', (err, split) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof split, "object");
        chai.expect(split.getIcon()).to.equal('star');
        done();
      });
    });
    // TODO reconsider this test after full decaffeination
    it.skip('after setting an icon for the Component class, new instances should have that', (done) => {
      FooSplit.prototype.icon = 'trophy';
      l.load('foo/Split', (err, split) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof split, "object");
        chai.expect(split.getIcon()).to.equal('trophy');
        done();
      });
    });
    it('should not affect the original instance', () => {
      chai.expect(instance.getIcon()).to.equal('smile');
    });
  });
  describe('reading sources', () => {
    it('should be able to provide source code for a component', (done) => {
      l.getSource('Graph', (err, component) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof component, "object");
        assert.strictEqual(typeof component.code, "string");
        chai.expect(component.code.indexOf('Component')).to.not.equal(-1);

        if (!noflo.isBrowser()) {
          chai.expect(component.code.indexOf('export function getComponent')).to.not.equal(-1);
        } else {
          chai.expect(component.code.indexOf('exports.getComponent')).to.not.equal(-1);
        }

        assert.strictEqual(component.name, 'Graph');
        assert.strictEqual(component.library, '');
        assert.strictEqual(component.language, shippingLanguage);
        done();
      });
    });
    it('should return an error for missing components', (done) => {
      l.getSource('foo/BarBaz', (err) => {
        assert.strictEqual(typeof err, "error");
        done();
      });
    });
    it('should return an error for non-file components', (done) => {
      if (noflo.isBrowser()) {
        // Browser runtime actually supports this via toString()
        done();
        return;
      }
      l.getSource('foo/Split', (err) => {
        assert.strictEqual(typeof err, "error");
        done();
      });
    });
    it('should be able to provide source for a graph file component', (done) => {
      const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
      l.components.Subgraph = file;
      l.getSource('Subgraph', (err, src) => {
        if (err) {
          done(err);
          return;
        }
        chai.expect(src.code).to.not.be.empty;
        assert.strictEqual(src.language, 'json');
        done();
      });
    });
    it('should be able to provide source for a graph object component', (done) => {
      const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
      noflo.graph.loadFile(file, (err, graph) => {
        if (err) {
          done(err);
          return;
        }
        l.components.Subgraph2 = graph;
        l.getSource('Subgraph2', (err, src) => {
          if (err) {
            done(err);
            return;
          }
          chai.expect(src.code).to.not.be.empty;
          assert.strictEqual(src.language, 'json');
          done();
        });
      });
    });
    it('should be able to get the source for non-ready ComponentLoader', (done) => {
      const loader = new noflo.ComponentLoader(baseDir);
      loader.getSource('Graph', (err, component) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof component, "object");
        assert.strictEqual(typeof component.code, "string");
        chai.expect(component.code.indexOf('Component')).to.not.equal(-1);
        if (!noflo.isBrowser()) {
          chai.expect(component.code.indexOf('export function getComponent')).to.not.equal(-1);
        } else {
          chai.expect(component.code.indexOf('exports.getComponent')).to.not.equal(-1);
        }
        assert.strictEqual(component.name, 'Graph');
        assert.strictEqual(component.library, '');
        assert.strictEqual(component.language, shippingLanguage);
        done();
      });
    });
  });
  describe('getting supported languages', () => {
    it('should include the expected ones', () => {
      const expectedLanguages = ['es2015', 'javascript'];
      if (!noflo.isBrowser()) {
        expectedLanguages.push('coffeescript');
        expectedLanguages.push('typescript');
      }
      expectedLanguages.sort();
      const supportedLanguages = l.getLanguages();
      supportedLanguages.sort();
      assert.deepStrictEqual(supportedLanguages, expectedLanguages);
    });
  });
  describe('writing sources', () => {
    let localNofloPath;
    if (!noflo.isBrowser()) {
      localNofloPath = JSON.stringify(path.resolve(__dirname, '../lib/NoFlo'));
    }
    describe('with working code', () => {
      describe('with ES5', () => {
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

        it('should be able to set the source', function (done) {
          this.timeout(10000);
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          l.setSource('foo', 'RepeatData', workingSource, 'javascript', (err) => {
            if (err) {
              done(err);
              return;
            }
            done();
          });
        });
        it('should be a loadable component', (done) => {
          l.load('foo/RepeatData', (err, inst) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(typeof inst, "object");
            chai.expect(inst.inPorts).to.contain.keys(['in']);
            chai.expect(inst.outPorts).to.contain.keys(['out']);
            const ins = new noflo.internalSocket.InternalSocket();
            const out = new noflo.internalSocket.InternalSocket();
            inst.inPorts.in.attach(ins);
            inst.outPorts.out.attach(out);
            out.on('ip', (ip) => {
              assert.strictEqual(ip.type, 'data');
              assert.strictEqual(ip.data, 'ES5');
              done();
            });
            ins.send('ES5');
          });
        });
        it('should return sources in the same format', (done) => {
          l.getSource('foo/RepeatData', (err, source) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(source.language, 'javascript');
            assert.strictEqual(source.code, workingSource);
            done();
          });
        });
        it('should be able to set the source for non-ready ComponentLoader', function (done) {
          this.timeout(10000);
          const loader = new noflo.ComponentLoader(baseDir);
          loader.setSource('foo', 'RepeatData', workingSource, 'javascript', done);
        });
      });
      describe('with ES6', () => {
        before(function () {
          if (l.getLanguages().indexOf('es2015') === -1) {
            this.skip();
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

        it('should be able to set the source', function (done) {
          this.timeout(10000);
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          l.setSource('foo', 'RepeatDataES6', workingSource, 'es2015', (err) => {
            if (err) {
              done(err);
              return;
            }
            done();
          });
        });
        it('should be a loadable component', (done) => {
          l.load('foo/RepeatDataES6', (err, inst) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(typeof inst, "object");
            chai.expect(inst.inPorts).to.contain.keys(['in']);
            chai.expect(inst.outPorts).to.contain.keys(['out']);
            const ins = new noflo.internalSocket.InternalSocket();
            const out = new noflo.internalSocket.InternalSocket();
            inst.inPorts.in.attach(ins);
            inst.outPorts.out.attach(out);
            out.on('ip', (ip) => {
              assert.strictEqual(ip.type, 'data');
              assert.strictEqual(ip.data, 'ES6');
              done();
            });
            ins.send('ES6');
          });
        });
        it('should return sources in the same format', (done) => {
          l.getSource('foo/RepeatDataES6', (err, source) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(source.language, 'es2015');
            assert.strictEqual(source.code, workingSource);
            done();
          });
        });
      });
      describe('with CoffeeScript', () => {
        before(function () {
          if (l.getLanguages().indexOf('coffeescript') === -1) {
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

        it('should be able to set the source', function (done) {
          this.timeout(10000);
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          l.setSource('foo', 'RepeatDataCoffee', workingSource, 'coffeescript', (err) => {
            if (err) {
              done(err);
              return;
            }
            done();
          });
        });
        it('should be a loadable component', (done) => {
          l.load('foo/RepeatDataCoffee', (err, inst) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(typeof inst, "object");
            chai.expect(inst.inPorts).to.contain.keys(['in']);
            chai.expect(inst.outPorts).to.contain.keys(['out']);
            const ins = new noflo.internalSocket.InternalSocket();
            const out = new noflo.internalSocket.InternalSocket();
            inst.inPorts.in.attach(ins);
            inst.outPorts.out.attach(out);
            out.on('ip', (ip) => {
              assert.strictEqual(ip.type, 'data');
              assert.strictEqual(ip.data, 'CoffeeScript');
              done();
            });
            ins.send('CoffeeScript');
          });
        });
        it('should return sources in the same format', (done) => {
          l.getSource('foo/RepeatDataCoffee', (err, source) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(source.language, 'coffeescript');
            assert.strictEqual(source.code, workingSource);
            done();
          });
        });
      });
      describe('with TypeScript', () => {
        before(function () {
          if (l.getLanguages().indexOf('typescript') === -1) {
            this.skip();
          }
        });
        let workingSource = `\
import { Component } from 'noflo';
exports.getComponent = (): Component => {
  const c = new noflo.Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process((input, output): void => {
    output.sendDone(input.get('in'));
  });
  return c;
};
`;

        it('should be able to set the source', function (done) {
          this.timeout(10000);
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          l.setSource('foo', 'RepeatDataTypeScript', workingSource, 'typescript', (err) => {
            if (err) {
              done(err);
              return;
            }
            done();
          });
        });
        it('should be a loadable component', (done) => {
          l.load('foo/RepeatDataTypeScript', (err, inst) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(typeof inst, "object");
            chai.expect(inst.inPorts).to.contain.keys(['in']);
            chai.expect(inst.outPorts).to.contain.keys(['out']);
            const ins = new noflo.internalSocket.InternalSocket();
            const out = new noflo.internalSocket.InternalSocket();
            inst.inPorts.in.attach(ins);
            inst.outPorts.out.attach(out);
            out.on('ip', (ip) => {
              assert.strictEqual(ip.type, 'data');
              assert.strictEqual(ip.data, 'TypeScript');
              done();
            });
            ins.send('TypeScript');
          });
        });
        it('should return sources in the same format', (done) => {
          l.getSource('foo/RepeatDataTypeScript', (err, source) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(source.language, 'typescript');
            assert.strictEqual(source.code, workingSource);
            done();
          });
        });
      });
    });
    describe('with non-working code', () => {
      describe('without exports', () => {
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

        it('should not be able to set the source', (done) => {
          if (!noflo.isBrowser()) {
            nonWorkingSource = nonWorkingSource.replace("'noflo'", localNofloPath);
          }
          l.setSource('foo', 'NotWorking', nonWorkingSource, 'js', (err) => {
            assert.strictEqual(typeof err, "error");
            assert.ok(err.message.includes('runnable component'));
            done();
          });
        });
        it('should not be a loadable component', (done) => {
          l.load('foo/NotWorking', (err, inst) => {
            assert.strictEqual(typeof err, "error");
            assert.strictEqual(typeof inst, "undefined");
            done();
          });
        });
      });
      describe('with non-existing import', () => {
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

        it('should not be able to set the source', (done) => {
          if (!noflo.isBrowser()) {
            nonWorkingSource = nonWorkingSource.replace("'noflo'", localNofloPath);
          }
          l.setSource('foo', 'NotWorking', nonWorkingSource, 'js', (err) => {
            assert.strictEqual(typeof err, "error");
            done();
          });
        });
        it('should not be a loadable component', (done) => {
          l.load('foo/NotWorking', (err, inst) => {
            assert.strictEqual(typeof err, "error");
            assert.strictEqual(typeof inst, "undefined");
            done();
          });
        });
      });
    });
  });
});
describe('ComponentLoader with a fixture project', () => {
  let l = null;
  before(function () {
    if (noflo.isBrowser()) {
      this.skip();
    }
  });
  it('should be possible to instantiate', () => {
    l = new noflo.ComponentLoader(path.resolve(__dirname, 'fixtures/componentloader'));
  });
  it('should initially know of no components', () => {
    assert.strictEqual(typeof l.components, "null");
  });
  it('should not initially be ready', () => {
    assert.strictEqual(l.ready, false);
  });
  it('should be able to read a list of components', (done) => {
    l.listComponents((err, components) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(l.processing, null);
      chai.expect(l.components).not.to.be.empty;
      assert.strictEqual(components, l.components);
      assert.strictEqual(l.ready, true);
      done();
    });
    assert.strictEqual(typeof l.processing, "promise");
  });
  it('should be able to load a local ES Module component', (done) => {
    l.load('componentloader/SendString', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Send string');
      assert.strictEqual(instance.icon, 'cloud');
      done();
    });
  });
  it('should be able to load a local CommonJS component', (done) => {
    l.load('componentloader/Output', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Output stuff');
      assert.strictEqual(instance.icon, 'cloud');
      done();
    });
  });
  it('should be able to load a local CoffeeScript component', (done) => {
    l.load('componentloader/RepeatAsync', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Repeat stuff async');
      assert.strictEqual(instance.icon, 'forward');
      done();
    });
  });
  it('should be able to load a local TypeScript component', (done) => {
    l.load('componentloader/Repeat', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Repeat stuff');
      assert.strictEqual(instance.icon, 'cloud');
      done();
    });
  });
  it('should be able to find specs for a local TypeScript component', (done) => {
    l.getSource('componentloader/Repeat', (err, source) => {
      if (err) {
        done(err);
        return;
      }
      chai.expect(source.tests).to.include('componentloader/Repeat');
      done();
    });
  });
  it('should be able to load a JavaScript component from a dependency', (done) => {
    l.load('example/Forward', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Forward stuff');
      assert.strictEqual(instance.icon, 'car');
      done();
    });
  });
  it('should be able to load a CoffeeScript component from a dependency', (done) => {
    l.load('example/RepeatAsync', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Repeat stuff async');
      assert.strictEqual(instance.icon, 'forward');
      done();
    });
  });
  it('should be able to find specs for a CoffeeScript component from a dependency', (done) => {
    l.getSource('example/RepeatAsync', (err, source) => {
      if (err) {
        done(err);
        return;
      }
      chai.expect(source.tests).to.include('example/RepeatAsync');
      done();
    });
  });
  it('should be able to load a TypeScript component from a dependency', (done) => {
    l.load('example/Repeat', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Repeat stuff');
      assert.strictEqual(instance.icon, 'car');
      done();
    });
  });
  it('should be able to load a dynamically registered component from a dependency', (done) => {
    l.load('example/Hello', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Hello stuff');
      assert.strictEqual(instance.icon, 'bicycle');
      done();
    });
  });
  it('should be able to load core Graph component', (done) => {
    l.load('Graph', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.icon, 'sitemap');
      done();
    });
  });
  it('should fail loading a missing component', (done) => {
    l.load('componentloader/Missing', (err) => {
      assert.strictEqual(typeof err, "error");
      done();
    });
  });
});
describe('ComponentLoader with a fixture project and caching', () => {
  let l = null;
  let fixtureRoot = null;
  before(function () {
    if (noflo.isBrowser()) {
      this.skip();
      return;
    }
    fixtureRoot = path.resolve(__dirname, 'fixtures/componentloader');
  });
  after((done) => {
    if (noflo.isBrowser()) {
      done();
      return;
    }
    const manifestPath = path.resolve(fixtureRoot, 'fbp.json');
    const { unlink } = require('fs');
    unlink(manifestPath, done);
  });
  it('should be possible to pre-heat the cache file', function (done) {
    this.timeout(8000);
    const { exec } = require('child_process');
    exec(
      `node ${path.resolve(__dirname, '../bin/noflo-cache-preheat')}`,
      { cwd: fixtureRoot },
      done,
    );
  });
  it('should have populated a fbp-manifest file', (done) => {
    const manifestPath = path.resolve(fixtureRoot, 'fbp.json');
    const { stat } = require('fs');
    stat(manifestPath, (err, stats) => {
      if (err) {
        done(err);
        return;
      }
      chai.expect(stats.isFile()).to.equal(true);
      done();
    });
  });
  it('should be possible to instantiate', () => {
    l = new noflo.ComponentLoader(fixtureRoot,
      { cache: true });
  });
  it('should initially know of no components', () => {
    assert.strictEqual(typeof l.components, "null");
  });
  it('should not initially be ready', () => {
    assert.strictEqual(l.ready, false);
  });
  it('should be able to read a list of components', (done) => {
    l.listComponents((err, components) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(l.processing, null);
      chai.expect(l.components).not.to.be.empty;
      assert.strictEqual(components, l.components);
      assert.strictEqual(l.ready, true);
      done();
    });
    assert.strictEqual(typeof l.processing, "promise");
  });
  it('should be able to load a local ES Module component', (done) => {
    l.load('componentloader/SendString', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Send string');
      assert.strictEqual(instance.icon, 'cloud');
      done();
    });
  });
  it('should be able to load a local CommonJS component', (done) => {
    l.load('componentloader/Output', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Output stuff');
      assert.strictEqual(instance.icon, 'cloud');
      done();
    });
  });
  it('should be able to load a component from a dependency', (done) => {
    l.load('example/Forward', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Forward stuff');
      assert.strictEqual(instance.icon, 'car');
      done();
    });
  });
  it('should be able to load a dynamically registered component from a dependency', (done) => {
    l.load('example/Hello', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.description, 'Hello stuff');
      assert.strictEqual(instance.icon, 'bicycle');
      done();
    });
  });
  it('should be able to load core Graph component', (done) => {
    l.load('Graph', (err, instance) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(instance.icon, 'sitemap');
      done();
    });
  });
  it('should fail loading a missing component', (done) => {
    l.load('componentloader/Missing', (err) => {
      assert.strictEqual(typeof err, "error");
      done();
    });
  });
  it('should fail with missing manifest without discover option', (done) => {
    l = new noflo.ComponentLoader(fixtureRoot, {
      cache: true,
      discover: false,
      manifest: 'fbp2.json',
    });
    l.listComponents((err) => {
      assert.strictEqual(typeof err, "error");
      done();
    });
  });
  it('should be able to use a custom manifest file', function (done) {
    this.timeout(8000);
    l = new noflo.ComponentLoader(fixtureRoot, {
      cache: true,
      discover: true,
      manifest: 'fbp2.json',
    });
    l.listComponents((err) => {
      if (err) {
        done(err);
        return;
      }
      assert.strictEqual(l.processing, null);
      chai.expect(l.components).not.to.be.empty;
      done();
    });
  });
  it('should have saved the new manifest', (done) => {
    const manifestPath = path.resolve(fixtureRoot, 'fbp2.json');
    const { unlink } = require('fs');
    unlink(manifestPath, done);
  });
});
