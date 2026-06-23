import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import path from 'node:path';
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

const baseDir = process.cwd();

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
    assert.strictEqual(l.processing, null);
  });
  it('should not have any packages in the checked list', () => {
    assert.strictEqual(l.checked, undefined);
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
  it('should be able to read a list of components', () => {
    return l.listComponents()
      .then((components) => {
        assert.strictEqual(l.processing, null, 'should have stopped processing');
        assert.notDeepEqual(l.components, [], 'should contain components');
        assert.strictEqual(components, l.components, 'should have returned the full list');
        assert.strictEqual(l.ready, true, 'should have been set ready');
      });

    if (!noflo.isBrowser()) {
      // Browser component registry can be synchronous
      assert.strictEqual(typeof l.processing, 'should have started processing', "promise");
    }
  });
  describe('calling listComponents twice simultaneously', () => {
    it('should return the same results', (t, done) => {
      const loader = new noflo.ComponentLoader(baseDir);
      const received = [];
      loader.listComponents()
        .then((components) => {
          received.push(components);
          if (received.length !== 2) { return; }
          assert.strictEqual(received[0], received[1]);
          done();
        })
        .catch(done);
      loader.listComponents()
        .then((components) => {
          received.push(components);
          if (received.length !== 2) { return; }
          assert.strictEqual(received[0], received[1]);
          done();
        })
        .catch(done);
    });
  });
  describe('after listing components', () => {
    it('should have the Graph component registered', () => {
      assert.ok(l.components.Graph);
    });
  });
  describe('loading the Graph component', () => {
    let instance = null;
    it('should be able to load the component', () => {
      return l.load('Graph')
        .then((inst) => {
          assert.strictEqual(typeof inst, "object");
          assert.strictEqual(inst.componentName, 'Graph');
          instance = inst;
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
      assert.strictEqual(instance.isSubgraph(), true);
    });
    it('should know the description for the Graph', () => {
      assert.strictEqual(typeof instance.getDescription(), 'string');
    });
    it('should be able to provide an icon for the Graph', () => {
      assert.strictEqual(instance.getIcon(), 'sitemap');
    });
    it('should be able to load the component with non-ready ComponentLoader', () => {
      const loader = new noflo.ComponentLoader(baseDir);
      return loader.load('Graph')
        .then((inst) => {
          assert.strictEqual(typeof inst, "object");
          assert.strictEqual(inst.componentName, 'Graph');
          instance = inst;
        });
    });
  });

  describe('loading a subgraph', () => {
    l = new noflo.ComponentLoader(baseDir);
    const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
    it('should remove `graph` and `start` ports', () => {
      return l.listComponents()
        .then(() => {
          l.components.Merge = Merge;
          l.components.Subgraph = file;
          l.components.Split = Split;
          return l.load('Subgraph')
        })
        .then((inst) => {
          assert.strictEqual(typeof inst, "object");
          return new Promise((resolve) => {
            inst.once('ready', () => {
              assert.equal(Object.keys(inst.inPorts).includes('graph'), false, 'has GRAPH port');
              assert.equal(Object.keys(inst.inPorts).includes('start'), false, 'has START port');
              assert.equal(Object.keys(inst.inPorts).includes('in'), true, 'has IN port');
              assert.equal(Object.keys(inst.outPorts).includes('out'), true, 'has OUT port');
              resolve();
            });
          });
        });
    });
    it('should not automatically start the subgraph if there is no `start` port', () => {
      return l.listComponents()
        .then(() => {
          l.components.Merge = Merge;
          l.components.Subgraph = file;
          l.components.Split = Split;
          return l.load('Subgraph');
        })
        .then((inst) => {
          assert.strictEqual(typeof inst, "object");
          return new Promise((resolve) => {
            inst.once('ready', () => {
              assert.strictEqual(inst.started, false);
              resolve()
            });
          });
        });
    });
    it('should also work with a passed graph object', () => {
      return noflo.graph.loadFile(file)
        .then((graph) => {
          return l.listComponents()
            .then(() => {
              l.components.Merge = Merge;
              l.components.Subgraph = graph;
              l.components.Split = Split;
              return l.load('Subgraph');
            });
        })
        .then((inst) => {
          assert.strictEqual(typeof inst, "object");
          return new Promise((resolve) => {
            inst.once('ready', () => {
              assert.equal(Object.keys(inst.inPorts).includes('graph'), false, 'has GRAPH port');
              assert.equal(Object.keys(inst.inPorts).includes('start'), false, 'has START port');
              assert.equal(Object.keys(inst.inPorts).includes('in'), true, 'has IN port');
              assert.equal(Object.keys(inst.outPorts).includes('out'), true, 'has OUT port');
              resolve();
            });
          });
        });
    });
  });
  describe('loading the Graph component', () => {
    let instance = null;
    it('should be able to load the component', () => {
      return l.load('Graph')
        .then((graph) => {
          assert.strictEqual(typeof graph, "object");
          instance = graph;
        });
    });
    it('should have a reference to the Component Loader\'s baseDir', () => {
      assert.strictEqual(instance.baseDir, l.baseDir);
    });
  });
  describe('loading a component', () => {
    let loader = null;
    before(() => {
      loader = new noflo.ComponentLoader(baseDir);
      return loader.listComponents();
    });
    it('should return an error on an invalid component type', () => {
      loader.components.InvalidComponent = true;
      return loader.load('InvalidComponent')
        .then(() => Promise.reject(new Error('Unexpected success')))
        .catch((err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.strictEqual(err.message, 'Invalid type boolean for component InvalidComponent.');
        });
    });
    it('should return an error on a missing component path', () => {
      let str;
      loader.components.InvalidComponent = 'missing-file.js';
      if (noflo.isBrowser()) {
        str = 'Dynamic loading of';
      } else {
        str = 'Cannot find package';
      }
      loader.load('InvalidComponent', (err) => {
      return loader.load('InvalidComponent')
        .then(() => Promise.reject(new Error('Unexpected success')))
        .catch((err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.ok(err.message.includes(str));
        });
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
      assert.ok(Object.keys(l.components).includes('foo/Split'));
      assert.ok(Object.keys(l.components).includes('Graph'));
    });
    it('should be able to load the component', () => {
      return l.load('foo/Split')
        .then((split) => {
          assert.strictEqual(typeof split, "object");
          instance = split;
        });
    });
    it('should have the correct ports', () => {
      assert.equal(Object.keys(instance.inPorts).includes('in'), true, 'has IN port');
      assert.equal(Object.keys(instance.outPorts).includes('out'), true, 'has OUT port');
    });
    it('should have inherited its icon from the library', () => {
      assert.equal(instance.getIcon(), 'star');
    });
    it('should emit an event on icon change', (t, done) => {
      instance.once('icon', (newIcon) => {
        assert.strictEqual(newIcon, 'smile');
        done();
      });
      instance.setIcon('smile');
    });
    it('new instances should still contain the original icon', () => {
      return l.load('foo/Split')
        .then((split) => {
          assert.strictEqual(typeof split, "object");
          assert.equal(split.getIcon(), 'star');
        });
    });
    // TODO reconsider this test after full decaffeination
    it.skip('after setting an icon for the Component class, new instances should have that', (t, done) => {
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
      assert.equal(instance.getIcon(), 'smile');
    });
  });
  describe('reading sources', () => {
    it('should be able to provide source code for a component', () => {
      return l.getSource('Graph')
        .then((component) => {
          assert.strictEqual(typeof component, "object");
          assert.strictEqual(typeof component.code, "string");
          assert.notEqual(component.code.indexOf('Graph'), -1);
          assert.notEqual(component.code.indexOf('export function getComponent'), -1);

          assert.strictEqual(component.name, 'Graph');
          assert.strictEqual(component.library, '');
          assert.strictEqual(component.language, shippingLanguage);
        });
    });
    it('should return an error for missing components', () => {
      return l.getSource('foo/BarBaz')
        .then(() => Promise.reject(new Error('Unexpected success')))
        .catch((err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.ok(err.message.includes('not installed'));
        });
    });
    it('should return an error for non-file components', (t) => {
      if (noflo.isBrowser()) {
        // Browser runtime actually supports this via toString()
        t.skip();
        return;
      }
      return l.getSource('foo/Split')
        .then(() => Promise.reject(new Error('Unexpected success')))
        .catch((err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.ok(err.message.includes('Not a file'));
        });
    });
    it('should be able to provide source for a graph file component', () => {
      const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
      l.components.Subgraph = file;
      return l.getSource('Subgraph')
        .then((src) => {
          assert.ok(src.code.length > 0);
          assert.strictEqual(src.language, 'json');
        });
    });
    it('should be able to provide source for a graph object component', () => {
      const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
      return noflo.graph.loadFile(file)
        .then((graph) => {
          l.components.Subgraph2 = graph;
          return l.getSource('Subgraph2')
        })
        .then((src) => {
          assert.ok(src.code.length > 0);
          assert.strictEqual(src.language, 'json');
        });
    });
    it('should be able to get the source for non-ready ComponentLoader', () => {
      const loader = new noflo.ComponentLoader(baseDir);
      return loader.getSource('Graph')
        .then((component) => {
          assert.strictEqual(typeof component, "object");
          assert.strictEqual(typeof component.code, "string");
          assert.notEqual(component.code.indexOf('Graph'), -1);
          assert.notEqual(component.code.indexOf('export function getComponent'), -1);
          assert.strictEqual(component.name, 'Graph');
          assert.strictEqual(component.library, '');
          assert.strictEqual(component.language, shippingLanguage);
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
      localNofloPath = JSON.stringify(path.resolve(import.meta.dirname, '../src/lib/NoFlo'));
    }
    describe('with working code', () => {
      describe('with ES Modules', () => {
        let workingSource = `\
import { Component } from '../src/lib/Component.js';

export function getComponent() {
  var c = new Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process(function (input, output) {
    output.sendDone(input.get('in'));
  });
  return c;
};`;

        it('should be able to set the source', () => {
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          return l.setSource('foo', 'RepeatData', workingSource, 'javascript');
        });
        it('should be a loadable component', () => {
          return l.load('foo/RepeatData')
            .then((inst) => {
              assert.strictEqual(typeof inst, "object");
              assert.equal(Object.keys(inst.inPorts).includes('in'), true, 'has IN port');
              assert.equal(Object.keys(inst.outPorts).includes('out'), true, 'has OUT port');
              const ins = new noflo.internalSocket.InternalSocket();
              const out = new noflo.internalSocket.InternalSocket();
              inst.inPorts.in.attach(ins);
              inst.outPorts.out.attach(out);
              return new Promise((resolve) => {
                out.once('ip', (ip) => {
                  assert.strictEqual(ip.type, 'data');
                  assert.strictEqual(ip.data, 'ESM');
                  resolve();
                });
                ins.send('ESM');
              });
            });
        });
        it('should return sources in the same format', () => {
          return l.getSource('foo/RepeatData')
            .then((source) => {
              assert.strictEqual(source.language, 'javascript');
              assert.strictEqual(source.code, workingSource);
            });
        });
        it('should be able to set the source for non-ready ComponentLoader', function () {
          const loader = new noflo.ComponentLoader(baseDir);
          return loader.setSource('foo', 'RepeatData', workingSource, 'javascript');
        });
      });
      describe('with CommonJS', () => {
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

        it('should be able to set the source', () => {
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          return l.setSource('foo', 'RepeatDataCJS', workingSource, 'es2015');
        });
        it('should be a loadable component', () => {
          return l.load('foo/RepeatDataCJS')
            .then((inst) => {
              assert.strictEqual(typeof inst, "object");
              assert.equal(Object.keys(inst.inPorts).includes('in'), true, 'has IN port');
              assert.equal(Object.keys(inst.outPorts).includes('out'), true, 'has OUT port');
              const ins = new noflo.internalSocket.InternalSocket();
              const out = new noflo.internalSocket.InternalSocket();
              inst.inPorts.in.attach(ins);
              inst.outPorts.out.attach(out);
              return new Promise((resolve) => {
                out.once('ip', (ip) => {
                  assert.strictEqual(ip.type, 'data');
                  assert.strictEqual(ip.data, 'CJS');
                  resolve();
                });
                ins.send('CJS');
              });
            });
        });
        it('should return sources in the same format', () => {
          return l.getSource('foo/RepeatDataCJS')
            .then((source) => {
              assert.strictEqual(source.language, 'es2015');
              assert.strictEqual(source.code, workingSource);
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

        it('should be able to set the source', () => {
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          return l.setSource('foo', 'RepeatDataCoffee', workingSource, 'coffeescript');
        });
        it('should be a loadable component', () => {
          return l.load('foo/RepeatDataCoffee')
            .then((inst) => {
              assert.strictEqual(typeof inst, "object");
              assert.equal(Object.keys(inst.inPorts).includes('in'), true, 'has IN port');
              assert.equal(Object.keys(inst.outPorts).includes('out'), true, 'has OUT port');
              const ins = new noflo.internalSocket.InternalSocket();
              const out = new noflo.internalSocket.InternalSocket();
              inst.inPorts.in.attach(ins);
              inst.outPorts.out.attach(out);
              return new Promise((resolve) => {
                out.on('ip', (ip) => {
                  assert.strictEqual(ip.type, 'data');
                  assert.strictEqual(ip.data, 'CoffeeScript');
                  resolve();
                });
                ins.send('CoffeeScript');
              });
            });
        });
        it('should return sources in the same format', () => {
          return l.getSource('foo/RepeatDataCoffee')
            .then((source) => {
              assert.strictEqual(source.language, 'coffeescript');
              assert.strictEqual(source.code, workingSource);
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
  const c = new Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  c.process((input, output): void => {
    output.sendDone(input.get('in'));
  });
  return c;
};
`;

        it('should be able to set the source', () => {
          if (!noflo.isBrowser()) {
            workingSource = workingSource.replace("'noflo'", localNofloPath);
          }
          return l.setSource('foo', 'RepeatDataTypeScript', workingSource, 'typescript');
        });
        it('should be a loadable component', () => {
          return l.load('foo/RepeatDataTypeScript')
            .then((inst) => {
              assert.strictEqual(typeof inst, "object");
              assert.equal(Object.keys(inst.inPorts).includes('in'), true, 'has IN port');
              assert.equal(Object.keys(inst.outPorts).includes('out'), true, 'has OUT port');
              const ins = new noflo.internalSocket.InternalSocket();
              const out = new noflo.internalSocket.InternalSocket();
              inst.inPorts.in.attach(ins);
              inst.outPorts.out.attach(out);
              return new Promise((resolve) => {
                out.on('ip', (ip) => {
                  assert.strictEqual(ip.type, 'data');
                  assert.strictEqual(ip.data, 'TypeScript');
                  resolve();
                });
                ins.send('TypeScript');
              });
            });
        });
        it('should return sources in the same format', () => {
          return l.getSource('foo/RepeatDataTypeScript')
            .then((source) => {
              assert.strictEqual(source.language, 'typescript');
              assert.strictEqual(source.code, workingSource);
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

        it('should not be able to set the source', () => {
          if (!noflo.isBrowser()) {
            nonWorkingSource = nonWorkingSource.replace("'noflo'", localNofloPath);
          }
          return l.setSource('foo', 'NotWorking', nonWorkingSource, 'js')
            .then(() => Promise.reject(new Error('Unexpected success')))
            .catch((err) => {
              assert.strictEqual(Error.isError(err), true);
              assert.ok(err.message.includes('runnable component'));
            });
        });
        it('should not be a loadable component', () => {
          return l.load('foo/NotWorking')
            .then(() => Promise.reject(new Error('Unexpected success')))
            .catch((err) => {
              assert.strictEqual(Error.isError(err), true);
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

        it('should not be able to set the source', () => {
          if (!noflo.isBrowser()) {
            nonWorkingSource = nonWorkingSource.replace("'noflo'", localNofloPath);
          }
          return l.setSource('foo', 'NotWorking', nonWorkingSource, 'js')
            .then(() => Promise.reject(new Error('Unexpected success')))
            .catch((err) => {
              assert.strictEqual(Error.isError(err), true);
              assert.ok(err.message.includes('Cannot find module'));
            });
        });
        it('should not be a loadable component', () => {
          return l.load('foo/NotWorking')
            .then(() => Promise.reject(new Error('Unexpected success')))
            .catch((err) => {
              assert.strictEqual(Error.isError(err), true);
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
      l = new noflo.ComponentLoader(path.resolve(import.meta.dirname, 'fixtures/componentloader'));
    });
    it('should initially know of no components', () => {
      assert.strictEqual(l.components, null);
    });
    it('should not initially be ready', () => {
      assert.strictEqual(l.ready, false);
    });
    it('should be able to read a list of components', () => {
      return l.listComponents()
        .then((components) => {
          assert.strictEqual(l.processing, null);
          assert.notDeepEqual(l.components, []);
          assert.strictEqual(components, l.components);
          assert.strictEqual(l.ready, true);
        });
    });
    it.skip('should be able to load a local ES Module component', () => {
      return l.load('componentloader/SendString')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Send string');
          assert.strictEqual(instance.icon, 'cloud');
        });
    });
    it('should be able to load a local CommonJS component', () => {
      return l.load('componentloader/Output')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Output stuff');
          assert.strictEqual(instance.icon, 'cloud');
        });
    });
    it('should be able to load a local CoffeeScript component', () => {
      return l.load('componentloader/RepeatAsync')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Repeat stuff async');
          assert.strictEqual(instance.icon, 'forward');
        });
    });
    it('should be able to load a local TypeScript component', () => {
      return l.load('componentloader/Repeat')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Repeat stuff');
          assert.strictEqual(instance.icon, 'cloud');
        });
    });
    it('should be able to find specs for a local TypeScript component', () => {
      return l.getSource('componentloader/Repeat')
        .then((source) => {
          assert.ok(source.tests.indexOf('componentloader/Repeat') !== -1);
        });
    });
    it('should be able to load a JavaScript component from a dependency', () => {
      return l.load('example/Forward')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Forward stuff');
          assert.strictEqual(instance.icon, 'car');
        });
    });
    it('should be able to load a CoffeeScript component from a dependency', (t, done) => {
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
    it('should be able to find specs for a CoffeeScript component from a dependency', (t, done) => {
      l.getSource('example/RepeatAsync', (err, source) => {
        if (err) {
          done(err);
          return;
        }
        assert.ok(source.tests.indexOf('example/RepeatAsync') !== -1);
        done();
      });
    });
    it('should be able to load a TypeScript component from a dependency', (t, done) => {
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
    it('should be able to load a dynamically registered component from a dependency', (t, done) => {
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
    it('should be able to load core Graph component', (t, done) => {
      l.load('Graph', (err, instance) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(instance.icon, 'sitemap');
        done();
      });
    });
    it('should fail loading a missing component', () => {
      return l.load('componentloader/Missing')
        .then(() => Promise.reject(new Error('Unexpected success')))
        .catch((err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.ok(err.message.includes('not available'));
        });
    });
  });
  describe('ComponentLoader with a fixture project and caching', () => {
    let l = null;
    let fixtureRoot = null;
    before((t) => {
      if (noflo.isBrowser()) {
        t.skip();
        return;
      }
      fixtureRoot = path.resolve(import.meta.dirname, 'fixtures/componentloader');
    });
    after(() => {
      if (noflo.isBrowser()) {
        return Promise.resolve();
      }
      const manifestPath = path.resolve(fixtureRoot, 'fbp.json');
      return import('node:fs/promises')
        .then(({ unlink }) => {
          return unlink(manifestPath);
        });
    });
    it('should be possible to pre-heat the cache file', function (done) {
      return import('node:child_process')
        .then(({ exec }) => {
          return new Promise((resolve, reject) => {
            exec(
              `node ${path.resolve(import.meta.dirname, '../bin/noflo-cache-preheat')}`,
              { cwd: fixtureRoot },
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                resolve();
              }
            );
          });
        });
    });
    it('should have populated a fbp-manifest file', () => {
      const manifestPath = path.resolve(fixtureRoot, 'fbp.json');
      return import('node:fs/promises')
        .then(({ stat }) => {
          return stat(manifestPath);
        })
        .then((stats) => {
          assert.strictEqual(stats.isFile(), true);
        });
    });
    it('should be possible to instantiate', () => {
      l = new noflo.ComponentLoader(fixtureRoot,
        { cache: true });
    });
    it('should initially know of no components', () => {
      assert.strictEqual(l.components, null);
    });
    it('should not initially be ready', () => {
      assert.strictEqual(l.ready, false);
    });
    it('should be able to read a list of components', () => {
      return l.listComponents()
        .then((components) => {
          assert.strictEqual(l.processing, null);
          assert.ok(Object.keys(l.components).length > 0);
          assert.strictEqual(components, l.components);
          assert.strictEqual(l.ready, true);
        });
    });
    it.skip('should be able to load a local ES Module component', () => {
      return l.load('componentloader/SendString')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Send string');
          assert.strictEqual(instance.icon, 'cloud');
        });
    });
    it('should be able to load a local CommonJS component', () => {
      return l.load('componentloader/Output')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Output stuff');
          assert.strictEqual(instance.icon, 'cloud');
        });
    });
    it('should be able to load a component from a dependency', () => {
      return l.load('example/Forward')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Forward stuff');
          assert.strictEqual(instance.icon, 'car');
        });
    });
    it('should be able to load a dynamically registered component from a dependency', () => {
      return l.load('example/Hello')
        .then((instance) => {
          assert.strictEqual(instance.description, 'Hello stuff');
          assert.strictEqual(instance.icon, 'bicycle');
        });
    });
    it('should be able to load core Graph component', () => {
      return l.load('Graph')
        .then((instance) => {
          assert.strictEqual(instance.icon, 'sitemap');
        });
    });
    it('should fail loading a missing component', () => {
      return l.load('componentloader/Missing')
        .then(() => Promise.reject(new Error('Unexpected success')))
        .catch((err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.ok(err.message.includes('not available'));
        });
    });
    it('should fail with missing manifest without discover option', () => {
      l = new noflo.ComponentLoader(fixtureRoot, {
        cache: true,
        discover: false,
        manifest: 'fbp2.json',
      });
      return l.listComponents()
        .then(() => Promise.reject(new Error('Unexpected success')))
        .catch((err) => {
          assert.strictEqual(Error.isError(err), true);
        });
    });
    it('should be able to use a custom manifest file', () => {
      l = new noflo.ComponentLoader(fixtureRoot, {
        cache: true,
        discover: true,
        manifest: 'fbp2.json',
      });
      return l.listComponents()
        .then(() => {
          assert.strictEqual(l.processing, null);
          assert.ok(Object.keys(l.components).length > 0);
        });
    });
    it('should have saved the new manifest', () => {
      const manifestPath = path.resolve(fixtureRoot, 'fbp2.json');
      return import('node:fs/promises')
        .then(({ unlink }) => {
          return unlink(manifestPath);
        });
    });
  });
});
