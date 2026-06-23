import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import * as noflo from '../src/lib/NoFlo.js';

describe('NoFlo Legacy Network', () => {
  const Split = () => new noflo.Component({
    inPorts: {
      in: { datatype: 'all' },
    },
    outPorts: {
      out: { datatype: 'all' },
    },
    process(input, output) {
      output.sendDone({ out: input.get('in') });
    },
  });
  const Merge = () => new noflo.Component({
    inPorts: {
      in: { datatype: 'all' },
    },
    outPorts: {
      out: { datatype: 'all' },
    },
    process(input, output) {
      output.sendDone({ out: input.get('in') });
    },
  });
  const Callback = () => new noflo.Component({
    inPorts: {
      in: { datatype: 'all' },
      callback: {
        datatype: 'all',
        control: true,
      },
    },
    process(input, output) {
      // Drop brackets
      if (!input.hasData('callback', 'in')) { return; }
      const cb = input.getData('callback');
      const data = input.getData('in');
      cb(data);
      output.done();
    },
  });
  describe('with an empty graph', () => {
    let g = null;
    let n = null;
    before((done) => {
      g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      noflo.createNetwork(g, {
        subscribeGraph: true,
        delay: true,
      },
      (err, network) => {
        if (err) {
          done(err);
          return;
        }
        n = network;
        n.connect(done);
      });
    });
    it('should initially be marked as stopped', () => {
      chai.expect(n.isStarted()).to.equal(false);
    });
    it('should initially have no processes', () => {
      chai.expect(n.processes).to.be.empty;
    });
    it('should initially have no active processes', () => {
      chai.expect(n.getActiveProcesses()).to.eql([]);
    });
    it('should initially have to connections', () => {
      chai.expect(n.connections).to.be.empty;
    });
    it('should initially have no IIPs', () => {
      chai.expect(n.initials).to.be.empty;
    });
    it('should have reference to the graph', () => {
      assert.strictEqual(n.graph, g);
    });
    it('should know its baseDir', () => {
      assert.strictEqual(n.baseDir, g.properties.baseDir);
    });
    it('should have a ComponentLoader', () => {
      assert.strictEqual(typeof n.loader, "object");
    });
    it('should have transmitted the baseDir to the Component Loader', () => {
      assert.strictEqual(n.loader.baseDir, g.properties.baseDir);
    });
    it('should be able to list components', function (done) {
      this.timeout(60 * 1000);
      n.loader.listComponents((err, components) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(typeof components, "object");
        done();
      });
    });
    it('should have an uptime', () => {
      chai.expect(n.uptime()).to.be.at.least(0);
    });
    describe('with new node', () => {
      it('should contain the node', (done) => {
        g.once('addNode', () => {
          setTimeout(() => {
            chai.expect(n.processes).not.to.be.empty;
            chai.expect(n.processes.Graph).to.exist;
            done();
          },
          10);
        });
        g.addNode('Graph', 'Graph',
          { foo: 'Bar' });
      });
      it('should have transmitted the node metadata to the process', () => {
        chai.expect(n.processes.Graph.component.metadata).to.exist;
        assert.strictEqual(typeof n.processes.Graph.component.metadata, "object");
        assert.deepStrictEqual(n.processes.Graph.component.metadata, g.getNode('Graph').metadata);
      });
      it('adding the same node again should be a no-op', (done) => {
        const originalProcess = n.getNode('Graph');
        const graphNode = g.getNode('Graph');
        n.addNode(graphNode, (err, newProcess) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(newProcess, originalProcess);
          done();
        });
      });
      it('should not contain the node after removal', (done) => {
        g.once('removeNode', () => {
          setTimeout(() => {
            chai.expect(n.processes).to.be.empty;
            done();
          },
          10);
        });
        g.removeNode('Graph');
      });
      it('should fail when removing the removed node again', (done) => {
        n.removeNode(
          { id: 'Graph' },
          (err) => {
            assert.strictEqual(typeof err, "error");
            assert.ok(err.message.includes('not found'));
            done();
          },
        );
      });
    });
    describe('with new edge', () => {
      before(() => {
        n.loader.components.Split = Split;
        g.addNode('A', 'Split');
        g.addNode('B', 'Split');
      });
      after(() => {
        g.removeNode('A');
        g.removeNode('B');
      });
      it('should contain the edge', (done) => {
        g.once('addEdge', () => {
          setTimeout(() => {
            chai.expect(n.connections).not.to.be.empty;
            assert.deepStrictEqual(n.connections[0].from, {
              process: n.getNode('A'),
              port: 'out',
              index: undefined,
            });
            assert.deepStrictEqual(n.connections[0].to, {
              process: n.getNode('B'),
              port: 'in',
              index: undefined,
            });
            done();
          },
          10);
        });
        g.addEdge('A', 'out', 'B', 'in');
      });
      it('should not contain the edge after removal', (done) => {
        g.once('removeEdge', () => {
          setTimeout(() => {
            chai.expect(n.connections).to.be.empty;
            done();
          },
          10);
        });
        g.removeEdge('A', 'out', 'B', 'in');
      });
    });
  });
  describe('with a simple graph', () => {
    let g = null;
    let n = null;
    let cb = null;
    before(function (done) {
      this.timeout(60 * 1000);
      g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      g.addNode('Merge', 'Merge');
      g.addNode('Callback', 'Callback');
      g.addEdge('Merge', 'out', 'Callback', 'in');
      g.addInitial((data) => {
        assert.strictEqual(data, 'Foo');
        cb();
      },
      'Callback', 'callback');
      g.addInitial('Foo', 'Merge', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      }, (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Split = Split;
        nw.loader.components.Merge = Merge;
        nw.loader.components.Callback = Callback;
        n = nw;
        nw.connect((err) => {
          if (err) {
            done(err);
            return;
          }
          done();
        });
      });
    });
    it('should send some initials when started', (done) => {
      chai.expect(n.initials).not.to.be.empty;
      cb = done;
      n.start((err) => {
        if (err) {
          done(err);
        }
      });
    });
    it('should contain two processes', () => {
      chai.expect(n.processes).to.not.be.empty;
      chai.expect(n.processes.Merge).to.exist;
      assert.strictEqual(typeof n.processes.Merge, "Object");
      chai.expect(n.processes.Callback).to.exist;
      assert.strictEqual(typeof n.processes.Callback, "Object");
    });
    it('the ports of the processes should know the node names', () => {
      Object.keys(n.processes.Callback.component.inPorts.ports).forEach((name) => {
        const port = n.processes.Callback.component.inPorts.ports[name];
        assert.strictEqual(port.name, name);
        assert.strictEqual(port.node, 'Callback');
        chai.expect(port.getId()).to.equal(`Callback ${name.toUpperCase()}`);
      });
      Object.keys(n.processes.Callback.component.outPorts.ports).forEach((name) => {
        const port = n.processes.Callback.component.outPorts.ports[name];
        assert.strictEqual(port.name, name);
        assert.strictEqual(port.node, 'Callback');
        chai.expect(port.getId()).to.equal(`Callback ${name.toUpperCase()}`);
      });
    });
    it('should contain 1 connection between processes and 2 for IIPs', () => {
      chai.expect(n.connections).to.not.be.empty;
      assert.strictEqual(n.connections.length, 3);
    });
    it('should have started in debug mode', () => {
      assert.strictEqual(n.debug, true);
      chai.expect(n.getDebug()).to.equal(true);
    });
    it('should emit a process-error when a component throws', (done) => {
      g.removeInitial('Callback', 'callback');
      g.removeInitial('Merge', 'in');
      g.addInitial(() => {
        throw new Error('got Foo');
      },
      'Callback', 'callback');
      g.addInitial('Foo', 'Merge', 'in');
      n.once('process-error', (err) => {
        assert.strictEqual(typeof err, "object");
        assert.strictEqual(err.id, 'Callback');
        assert.strictEqual(typeof err.metadata, "object");
        assert.strictEqual(typeof err.error, "error");
        assert.strictEqual(err.error.message, 'got Foo');
        done();
      });
      n.sendInitials();
    });
    describe('with a renamed node', () => {
      it('should have the process in a new location', (done) => {
        g.once('renameNode', () => {
          assert.strictEqual(typeof n.processes.Func, "object");
          done();
        });
        g.renameNode('Callback', 'Func');
      });
      it('shouldn\'t have the process in the old location', () => {
        assert.strictEqual(n.processes.Callback, undefined);
      });
      it('should fail to rename with the old name', (done) => {
        n.renameNode('Callback', 'Func', (err) => {
          assert.strictEqual(typeof err, "error");
          assert.ok(err.message.includes('not found'));
          done();
        });
      });
      it('should have informed the ports of their new node name', () => {
        Object.keys(n.processes.Func.component.inPorts.ports).forEach((name) => {
          const port = n.processes.Func.component.inPorts.ports[name];
          assert.strictEqual(port.name, name);
          assert.strictEqual(port.node, 'Func');
          chai.expect(port.getId()).to.equal(`Func ${name.toUpperCase()}`);
        });
        Object.keys(n.processes.Func.component.outPorts.ports).forEach((name) => {
          const port = n.processes.Func.component.outPorts.ports[name];
          assert.strictEqual(port.name, name);
          assert.strictEqual(port.node, 'Func');
          chai.expect(port.getId()).to.equal(`Func ${name.toUpperCase()}`);
        });
      });
    });
    describe('with process icon change', () => {
      it('should emit an icon event', (done) => {
        n.once('icon', (data) => {
          assert.strictEqual(typeof data, "object");
          assert.strictEqual(data.id, 'Func');
          assert.strictEqual(data.icon, 'flask');
          done();
        });
        n.processes.Func.component.setIcon('flask');
      });
    });
    describe('once stopped', () => {
      it('should be marked as stopped', (done) => {
        n.stop(() => {
          chai.expect(n.isStarted()).to.equal(false);
          done();
        });
      });
    });
    describe('without the delay option', () => {
      it('should auto-start', (done) => {
        g.removeInitial('Func', 'callback');
        noflo.graph.loadJSON(g.toJSON(), (err, graph) => {
          if (err) {
            done(err);
            return;
          }
          cb = done;
          // Pass the already-initialized component loader
          graph.properties.componentLoader = n.loader;
          graph.addInitial((data) => {
            assert.strictEqual(data, 'Foo');
            cb();
          },
          'Func', 'callback');
          noflo.createNetwork(graph, {
            subscribeGraph: true,
          }, (err) => {
            if (err) {
              done(err);
            }
          });
        });
      });
    });
  });
  describe('with nodes containing default ports', () => {
    let g = null;
    let testCallback = null;
    let c = null;
    let cb = null;

    beforeEach(() => {
      testCallback = null;
      c = null;
      cb = null;

      c = new noflo.Component();
      c.inPorts.add('in', {
        required: true,
        datatype: 'string',
        default: 'default-value',
      });
      c.outPorts.add('out');
      c.process((input, output) => {
        output.sendDone(input.get('in'));
      });
      cb = new noflo.Component();
      cb.inPorts.add('in', {
        required: true,
        datatype: 'all',
      });
      cb.process((input) => {
        if (!input.hasData('in')) { return; }
        testCallback(input.getData('in'));
      });
      g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      g.addNode('Def', 'Def');
      g.addNode('Cb', 'Cb');
      g.addEdge('Def', 'out', 'Cb', 'in');
    });
    it('should send default values to nodes without an edge', function (done) {
      this.timeout(60 * 1000);
      testCallback = function (data) {
        assert.strictEqual(data, 'default-value');
        done();
      };
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      }, (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Def = () => c;
        nw.loader.components.Cb = () => cb;
        nw.connect((err) => {
          if (err) {
            done(err);
            return;
          }
          nw.start((err) => {
            if (err) {
              done(err);
            }
          });
        });
      });
    });
    it('should not send default values to nodes with an edge', function (done) {
      this.timeout(60 * 1000);
      testCallback = function (data) {
        assert.strictEqual(data, 'from-edge');
        done();
      };
      g.addNode('Merge', 'Merge');
      g.addEdge('Merge', 'out', 'Def', 'in');
      g.addInitial('from-edge', 'Merge', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      }, (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Def = () => c;
        nw.loader.components.Cb = () => cb;
        nw.loader.components.Merge = Merge;
        nw.connect((err) => {
          if (err) {
            done(err);
            return;
          }
          nw.start((err) => {
            if (err) {
              done(err);
            }
          });
        });
      });
    });
    it('should not send default values to nodes with IIP', function (done) {
      this.timeout(60 * 1000);
      testCallback = function (data) {
        assert.strictEqual(data, 'from-IIP');
        done();
      };
      g.addInitial('from-IIP', 'Def', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      }, (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Def = () => c;
        nw.loader.components.Cb = () => cb;
        nw.loader.components.Merge = Merge;
        nw.connect((err) => {
          if (err) {
            done(err);
            return;
          }
          nw.start((err) => {
            if (err) {
              done(err);
            }
          });
        });
      });
    });
  });
  describe('with an existing IIP', () => {
    let g = null;
    let n = null;
    before(() => {
      g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      g.addNode('Callback', 'Callback');
      g.addNode('Repeat', 'Split');
      g.addEdge('Repeat', 'out', 'Callback', 'in');
    });
    it('should call the Callback with the original IIP value', function (done) {
      this.timeout(6000);
      const cb = function (packet) {
        assert.strictEqual(packet, 'Foo');
        done();
      };
      g.addInitial(cb, 'Callback', 'callback');
      g.addInitial('Foo', 'Repeat', 'in');
      setTimeout(() => {
        noflo.createNetwork(g, {
          delay: true,
          subscribeGraph: true,
        }, (err, nw) => {
          if (err) {
            done(err);
            return;
          }
          nw.loader.components.Split = Split;
          nw.loader.components.Merge = Merge;
          nw.loader.components.Callback = Callback;
          n = nw;
          nw.connect((err) => {
            if (err) {
              done(err);
              return;
            }
            nw.start((err) => {
              if (err) {
                done(err);
              }
            });
          });
        });
      },
      10);
    });
    it('should allow removing the IIPs', function (done) {
      this.timeout(6000);
      let removed = 0;
      const onRemove = function () {
        removed++;
        if (removed < 2) { return; }
        assert.strictEqual(n.initials.length, 0, 'No IIPs left');
        assert.strictEqual(n.connections.length, 1, 'Only one connection');
        g.removeListener('removeInitial', onRemove);
        done();
      };
      g.on('removeInitial', onRemove);
      g.removeInitial('Callback', 'callback');
      g.removeInitial('Repeat', 'in');
    });
    it('new IIPs to replace original ones should work correctly', (done) => {
      const cb = function (packet) {
        assert.strictEqual(packet, 'Baz');
        done();
      };
      g.addInitial(cb, 'Callback', 'callback');
      g.addInitial('Baz', 'Repeat', 'in');
      n.start((err) => {
        if (err) {
          done(err);
        }
      });
    });
    describe('on stopping', () => {
      it('processes should be running before the stop call', () => {
        assert.strictEqual(n.started, true);
        assert.strictEqual(n.processes.Repeat.component.started, true);
      });
      it('should emit the end event', function (done) {
        this.timeout(5000);
        // Ensure we have a connection open
        n.once('end', (endTimes) => {
          assert.strictEqual(typeof endTimes, "object");
          done();
        });
        n.stop((err) => {
          if (err) {
            done(err);
          }
        });
      });
      it('should have called the shutdown method of each process', () => {
        assert.strictEqual(n.processes.Repeat.component.started, false);
      });
    });
  });
  describe('with a very large network', () => {
    it('should be able to connect without errors', function (done) {
      let n;
      this.timeout(100000);
      const g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      let called = 0;
      for (n = 0; n <= 10000; n++) {
        g.addNode(`Repeat${n}`, 'Split');
      }
      g.addNode('Callback', 'Callback');
      for (n = 0; n <= 10000; n++) {
        g.addEdge(`Repeat${n}`, 'out', 'Callback', 'in');
      }
      g.addInitial(() => {
        called++;
      },
      'Callback', 'callback');
      for (n = 0; n <= 10000; n++) {
        g.addInitial(n, `Repeat${n}`, 'in');
      }

      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Split = Split;
        nw.loader.components.Callback = Callback;
        nw.once('end', () => {
          assert.strictEqual(called, 10001);
          done();
        });
        nw.connect((err) => {
          if (err) {
            done(err);
            return;
          }
          nw.start((err) => {
            if (err) {
              done(err);
            }
          });
        });
      });
    });
  });

  describe('with a faulty graph', () => {
    let loader = null;
    before((done) => {
      loader = new noflo.ComponentLoader(baseDir);
      loader.listComponents((err) => {
        if (err) {
          done(err);
          return;
        }
        loader.components.Split = Split;
        done();
      });
    });
    it('should fail on connect with non-existing component', (done) => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Baz');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect((err) => {
          assert.strictEqual(typeof err, "error");
          assert.ok(err.message.includes('not available'));
          done();
        });
      });
    });
    it('should fail on connect with missing target port', (done) => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'foo');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect((err) => {
          assert.strictEqual(typeof err, "error");
          assert.ok(err.message.includes('No inport'));
          done();
        });
      });
    });
    it('should fail on connect with missing source port', (done) => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'foo', 'Repeat2', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect((err) => {
          assert.strictEqual(typeof err, "error");
          assert.ok(err.message.includes('No outport'));
          done();
        });
      });
    });
    it('should fail on connect with missing IIP target port', (done) => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      g.addInitial('hello', 'Repeat1', 'baz');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect((err) => {
          assert.strictEqual(typeof err, "error");
          assert.ok(err.message.includes('No inport'));
          done();
        });
      });
    });
    it('should fail on connect with node without component', (done) => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      g.addInitial('hello', 'Repeat1', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect((err) => {
          assert.strictEqual(typeof err, "error");
          assert.ok(err.message.includes('No component defined'));
          done();
        });
      });
    });
    it('should fail to add an edge to a missing outbound node', (done) => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect((err) => {
          if (err) {
            done(err);
            return;
          }
          nw.addEdge({
            from: {
              node: 'Repeat2',
              port: 'out',
            },
            to: {
              node: 'Repeat1',
              port: 'in',
            },
          }, (err) => {
            assert.strictEqual(typeof err, "error");
            assert.ok(err.message.includes('No process defined for outbound node'));
            done();
          });
        });
      });
    });
    it('should fail to add an edge to a missing inbound node', (done) => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect((err) => {
          if (err) {
            done(err);
            return;
          }
          nw.addEdge({
            from: {
              node: 'Repeat1',
              port: 'out',
            },
            to: {
              node: 'Repeat2',
              port: 'in',
            },
          }, (err) => {
            assert.strictEqual(typeof err, "error");
            assert.ok(err.message.includes('No process defined for inbound node'));
            done();
          });
        });
      });
    });
  });
  describe('baseDir setting', () => {
    it('should set baseDir based on given graph', (done) => {
      const g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(nw.baseDir, baseDir);
        done();
      });
    });
    it('should fall back to CWD if graph has no baseDir', function (done) {
      if (noflo.isBrowser()) {
        this.skip();
        return;
      }
      const g = new noflo.Graph();
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(nw.baseDir, process.cwd());
        done();
      });
    });
    it('should set the baseDir for the component loader', (done) => {
      const g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: true,
      },
      (err, nw) => {
        if (err) {
          done(err);
          return;
        }
        assert.strictEqual(nw.baseDir, baseDir);
        assert.strictEqual(nw.loader.baseDir, baseDir);
        done();
      });
    });
  });
  describe('debug setting', () => {
    let n = null;
    let g = null;
    before((done) => {
      g = new noflo.Graph();
      g.properties.baseDir = baseDir;
      noflo.createNetwork(g, {
        subscribeGraph: true,
        delay: true,
      },
      (err, network) => {
        if (err) {
          done(err);
          return;
        }
        n = network;
        n.loader.components.Split = Split;
        g.addNode('A', 'Split');
        g.addNode('B', 'Split');
        g.addEdge('A', 'out', 'B', 'in');
        n.connect(done);
      });
    });
    it('should initially have debug enabled', () => {
      chai.expect(n.getDebug()).to.equal(true);
    });
    it('should have propagated debug setting to connections', () => {
      assert.strictEqual(n.connections[0].debug, n.getDebug());
    });
    it('calling setDebug with same value should be no-op', () => {
      n.setDebug(true);
      chai.expect(n.getDebug()).to.equal(true);
      assert.strictEqual(n.connections[0].debug, n.getDebug());
    });
    it('disabling debug should get propagated to connections', () => {
      n.setDebug(false);
      chai.expect(n.getDebug()).to.equal(false);
      assert.strictEqual(n.connections[0].debug, n.getDebug());
    });
  });
});
