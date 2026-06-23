import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import * as noflo from '../src/lib/NoFlo.js';

describe('NoFlo Network (synchronous delivery)', () => {
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
    before(() => {
      g = new noflo.Graph();
      return noflo.createNetwork(g, {
        subscribeGraph: false,
        asyncDelivery: false,
        delay: true,
        baseDir: process.cwd(),
      })
        .then((network) => {
          n = network;
          return n.connect();
        });
    });
    it('should initially be marked as stopped', () => {
      assert.equal(n.isStarted(), false);
    });
    it('should initially have no processes', () => {
      assert.deepEqual(n.processes, {});
    });
    it('should initially have no active processes', () => {
      assert.deepEqual(n.getActiveProcesses(), []);
    });
    it('should initially have to connections', () => {
      assert.deepEqual(n.connections, []);
    });
    it('should initially have no IIPs', () => {
      assert.deepEqual(n.initials, []);
    });
    it('should have reference to the graph', () => {
      assert.strictEqual(n.graph, g);
    });
    it('should know its baseDir', () => {
      assert.strictEqual(n.baseDir, process.cwd());
    });
    it('should have a ComponentLoader', () => {
      assert.strictEqual(typeof n.loader, "object");
    });
    it('should have transmitted the baseDir to the Component Loader', () => {
      assert.strictEqual(n.loader.baseDir, process.cwd());
    });
    it('should be able to list components', function () {
      return n.loader.listComponents()
        .then((components) => {
          assert.strictEqual(typeof components, "object");
        });
    });
    it('should have an uptime', () => {
      assert.ok(n.uptime() >= 0);
    });
    describe('with new node', () => {
      it('should contain the node', () => n
        .addNode({
          id: 'Graph',
          component: 'Graph',
          metadata: {
            foo: 'Bar',
          },
        }));
      it('should have registered the node with the graph', () => {
        const node = g.getNode('Graph');
        assert.strictEqual(typeof node, "object");
        assert.strictEqual(node.component, 'Graph');
      });
      it('should have transmitted the node metadata to the process', () => {
        assert.ok(n.processes.Graph.component.metadata);
        assert.strictEqual(typeof n.processes.Graph.component.metadata, "object");
        assert.deepStrictEqual(n.processes.Graph.component.metadata, g.getNode('Graph').metadata);
      });
      it('adding the same node again should be a no-op', () => {
        const originalProcess = n.getNode('Graph');
        const graphNode = g.getNode('Graph');
        return n.addNode(graphNode)
          .then((newProcess) => {
            assert.strictEqual(newProcess, originalProcess);
          });
      });
      it('should not contain the node after removal', () => n.removeNode({
        id: 'Graph',
      })
        .then(() => {
          assert.deepEqual(n.processes, {});
        }));
      it('should have removed the node from the graph', () => {
        const node = g.getNode('graph');
        assert.strictEqual(node, null);
      });
      it('should fail when removing the removed node again', () => n.removeNode({
        id: 'Graph',
      })
        .then(
          () => Promise.reject(new Error('Unexpected success')),
          (err) => {
            assert.ok(Error.isError(err));
            assert.ok(err.message.includes('not found'));
          },
        ));
    });
    describe('with new edge', () => {
      before(() => {
        n.loader.components.Split = Split;
        return n.addNode({
          id: 'A',
          component: 'Split',
        })
          .then(() => n.addNode({
            id: 'B',
            component: 'Split',
          }));
      });
      after(() => n.removeNode({
        id: 'A',
      })
        .then(() => n.removeNode({
          id: 'B',
        })));
      it('should contain the edge', () => n.addEdge({
        from: {
          node: 'A',
          port: 'out',
        },
        to: {
          node: 'B',
          port: 'in',
        },
      })
        .then(() => {
          assert.notDeepEqual(n.connections, []);
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
        }));
      it('should have registered the edge with the graph', () => {
        const edge = g.getEdge('A', 'out', 'B', 'in');
        assert.notEqual(edge, null);
      });
      it('should not contain the edge after removal', () => n.removeEdge({
        from: {
          node: 'A',
          port: 'out',
        },
        to: {
          node: 'B',
          port: 'in',
        },
      })
        .then(() => {
          assert.deepEqual(n.connections, []);
        }));
      it('should have removed the edge from the graph', () => {
        const edge = g.getEdge('A', 'out', 'B', 'in');
        assert.strictEqual(edge, null);
      });
    });
  });
  describe('with a simple graph', () => {
    let g = null;
    let n = null;
    before(function () {
      g = new noflo.Graph();
      g.addNode('Merge', 'Merge');
      g.addNode('Callback', 'Callback');
      g.addEdge('Merge', 'out', 'Callback', 'in');
      g.addInitial(
        (data) => {
          assert.strictEqual(data, 'Foo');
        },
        'Callback',
        'callback',
      );
      g.addInitial('Foo', 'Merge', 'in');
      return noflo.createNetwork(g, {
        subscribeGraph: false,
        asyncDelivery: false,
        delay: true,
        baseDir: process.cwd(),
      })
        .then((nw) => {
          nw.loader.components.Split = Split;
          nw.loader.components.Merge = Merge;
          nw.loader.components.Callback = Callback;
          n = nw;
          return nw.connect();
        });
    });
    it('should send some initials when started', () => {
      assert.notDeepEqual(n.initials, []);
      return n.start();
    });
    it('should contain two processes', () => {
      assert.notDeepEqual(n.processes, {});
      assert.ok(n.processes.Merge);
      assert.strictEqual(typeof n.processes.Merge, "object");
      assert.ok(n.processes.Callback);
      assert.strictEqual(typeof n.processes.Callback, "object");
    });
    it('the ports of the processes should know the node names', () => {
      Object.keys(n.processes.Callback.component.inPorts.ports).forEach((name) => {
        const port = n.processes.Callback.component.inPorts.ports[name];
        assert.strictEqual(port.name, name);
        assert.strictEqual(port.node, 'Callback');
        assert.equal(port.getId(), `Callback ${name.toUpperCase()}`);
      });
      Object.keys(n.processes.Callback.component.outPorts.ports).forEach((name) => {
        const port = n.processes.Callback.component.outPorts.ports[name];
        assert.strictEqual(port.name, name);
        assert.strictEqual(port.node, 'Callback');
        assert.equal(port.getId(), `Callback ${name.toUpperCase()}`);
      });
    });
    it('should contain 1 connection between processes and 2 for IIPs', () => {
      assert.notDeepEqual(n.connections, []);
      assert.strictEqual(n.connections.length, 3);
    });
    it('should have started in debug mode', () => {
      assert.strictEqual(n.debug, true);
      assert.equal(n.getDebug(), true);
    });
    it('should emit a process-error when a component throws', () => Promise.resolve()
      .then(() => n.removeInitial({
        to: {
          node: 'Callback',
          port: 'callback',
        },
      }))
      .then(() => n.removeInitial({
        to: {
          node: 'Merge',
          port: 'in',
        },
      }))
      .then(() => n.addInitial({
        from: {
          data() { throw new Error('got Foo'); },
        },
        to: {
          node: 'Callback',
          port: 'callback',
        },
      }))
      .then(() => n.addInitial({
        from: {
          data: 'Foo',
        },
        to: {
          node: 'Merge',
          port: 'in',
        },
      }))
      .then(() => new Promise((resolve, reject) => {
        n.once('process-error', (err) => {
          assert.strictEqual(typeof err, "object");
          assert.strictEqual(err.id, 'Callback');
          assert.strictEqual(typeof err.metadata, "object");
          assert.ok(Error.isError(err.error))
          assert.strictEqual(err.error.message, 'got Foo');
          resolve();
        });
        n.sendInitials().catch(reject);
      })));
    describe('with a renamed node', () => {
      it('should have the process in a new location', () => n.renameNode('Callback', 'Func')
        .then(() => {
          assert.strictEqual(typeof n.processes.Func, "object");
        }));
      it('shouldn\'t have the process in the old location', () => {
        assert.strictEqual(Object.keys(n.processes).includes('Callback'), false);
      });
      it('should have updated the name in the graph', () => {
        assert.equal(n.getNode('Callback'), undefined);
        assert.notEqual(n.getNode('Func'), null);
      });
      it('should fail to rename with the old name', () => n.renameNode('Callback', 'Func')
        .then(
          () => Promise.reject(new Error('Unexpected success')),
          (err) => {
            assert.ok(Error.isError(err));
            assert.ok(err.message.includes('not found'));
          },
        ));
      it('should have informed the ports of their new node name', () => {
        Object.keys(n.processes.Func.component.inPorts.ports).forEach((name) => {
          const port = n.processes.Func.component.inPorts.ports[name];
          assert.strictEqual(port.name, name);
          assert.strictEqual(port.node, 'Func');
          assert.equal(port.getId(), `Func ${name.toUpperCase()}`);
        });
        Object.keys(n.processes.Func.component.outPorts.ports).forEach((name) => {
          const port = n.processes.Func.component.outPorts.ports[name];
          assert.strictEqual(port.name, name);
          assert.strictEqual(port.node, 'Func');
          assert.equal(port.getId(), `Func ${name.toUpperCase()}`);
        });
      });
    });
    describe('with process icon change', () => {
      it('should emit an icon event', (t, done) => {
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
      it('should be marked as stopped', () => n.stop()
        .then(() => {
          assert.equal(n.isStarted(), false);
        }));
    });
    describe('without the delay option', () => {
      it('should auto-start', (t, done) => {
        g.removeInitial('Func', 'callback');
        noflo.graph.loadJSON(g.toJSON())
          .then((graph) => {
            // Pass the already-initialized component loader
            graph.addInitial(
              (data) => {
                assert.strictEqual(data, 'Foo');
                done();
              },
              'Func',
              'callback',
            );
            return noflo.createNetwork(graph, {
              subscribeGraph: false,
              asyncDelivery: false,
              delay: false,
              componentLoader: n.loader,
            });
          })
          .catch(done);
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
      g.addNode('Def', 'Def');
      g.addNode('Cb', 'Cb');
      g.addEdge('Def', 'out', 'Cb', 'in');
    });
    it('should send default values to nodes without an edge', function (t, done) {
      testCallback = function (data) {
        assert.strictEqual(data, 'default-value');
        done();
      };
      noflo.createNetwork(g, {
        subscribeGraph: false,
        asyncDelivery: false,
        delay: true,
        baseDir: process.cwd(),
      })
        .then((nw) => {
          nw.loader.components.Def = () => c;
          nw.loader.components.Cb = () => cb;
          return nw.connect();
        })
        .then((nw) => nw.start())
        .catch(done);
    });
    it('should not send default values to nodes with an edge', function (t, done) {
      testCallback = function (data) {
        assert.strictEqual(data, 'from-edge');
        done();
      };
      g.addNode('Merge', 'Merge');
      g.addEdge('Merge', 'out', 'Def', 'in');
      g.addInitial('from-edge', 'Merge', 'in');
      noflo.createNetwork(g, {
        subscribeGraph: false,
        asyncDelivery: false,
        delay: true,
        baseDir: process.cwd(),
      })
        .then((nw) => {
          nw.loader.components.Def = () => c;
          nw.loader.components.Cb = () => cb;
          nw.loader.components.Merge = Merge;
          return nw.connect();
        })
        .then((nw) => nw.start())
        .catch(done);
    });
    it('should not send default values to nodes with IIP', function (t, done) {
      testCallback = function (data) {
        assert.strictEqual(data, 'from-IIP');
        done();
      };
      g.addInitial('from-IIP', 'Def', 'in');
      noflo.createNetwork(g, {
        subscribeGraph: false,
        asyncDelivery: false,
        delay: true,
        baseDir: process.cwd(),
      })
        .then((nw) => {
          nw.loader.components.Def = () => c;
          nw.loader.components.Cb = () => cb;
          nw.loader.components.Merge = Merge;
          return nw.connect();
        })
        .then((nw) => nw.start())
        .catch(done);
    });
  });
  describe('with an existing IIP', () => {
    let g = null;
    let n = null;
    before(() => {
      g = new noflo.Graph()
        .addNode('Callback', 'Callback')
        .addNode('Repeat', 'Split')
        .addEdge('Repeat', 'out', 'Callback', 'in');
    });
    it('should call the Callback with the original IIP value', function (t, done) {
      const cb = function (packet) {
        assert.strictEqual(packet, 'Foo');
        done();
      };
      g.addInitial(cb, 'Callback', 'callback');
      g.addInitial('Foo', 'Repeat', 'in');
      setTimeout(() => {
        noflo.createNetwork(g, {
          delay: true,
          subscribeGraph: false,
          asyncDelivery: false,
          baseDir: process.cwd(),
        })
          .then((nw) => {
            nw.loader.components.Split = Split;
            nw.loader.components.Merge = Merge;
            nw.loader.components.Callback = Callback;
            n = nw;
            return nw.connect();
          })
          .then((nw) => nw.start())
          .catch(done);
      }, 10);
    });
    it('should allow removing the IIPs', () => Promise.resolve()
      .then(() => n.removeInitial({
        to: {
          node: 'Callback',
          port: 'callback',
        },
      }))
      .then(() => n.removeInitial({
        to: {
          node: 'Repeat',
          port: 'in',
        },
      }))
      .then(() => {
        assert.strictEqual(n.initials.length, 0, 'No IIPs left');
        assert.strictEqual(n.connections.length, 1, 'Only one connection');
      }));
    it('new IIPs to replace original ones should work correctly', (t, done) => {
      const cb = function (packet) {
        assert.strictEqual(packet, 'Baz');
        done();
      };
      Promise.resolve()
        .then(() => n.addInitial({
          from: {
            data: cb,
          },
          to: {
            node: 'Callback',
            port: 'callback',
          },
        }))
        .then(() => n.addInitial({
          from: {
            data: 'Baz',
          },
          to: {
            node: 'Repeat',
            port: 'in',
          },
        }))
        .then(() => n.start())
        .catch(done);
    });
    describe.skip('on stopping', () => {
      it('processes should be running before the stop call', () => {
        assert.strictEqual(n.started, true);
        assert.strictEqual(n.processes.Repeat.component.started, true);
      });
      it('should emit the end event', function (t, done) {
        if (n.stopped) {
          done(new Error('Cannot stop what wasn\'t running'));
          return;
        }
        // Ensure we have a connection open
        n.once('end', (endTimes) => {
          assert.strictEqual(typeof endTimes, "object");
          done();
        });
        n.stop().catch(done);
      });
      it('should have called the shutdown method of each process', () => {
        assert.strictEqual(n.processes.Repeat.component.started, false);
      });
    });
  });
  describe('with a very large network', () => {
    it('should be able to connect without errors', function (t, done) {
      let n;
      const g = new noflo.Graph();
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
        subscribeGraph: false,
        asyncDelivery: false,
        baseDir: process.cwd(),
      })
        .then((nw) => {
          nw.loader.components.Split = Split;
          nw.loader.components.Callback = Callback;
          nw.once('end', () => {
            assert.strictEqual(called, 10001);
            done();
          });
          return nw.connect();
        })
        .then((nw) => nw.start())
        .catch(done);
    });
  });
  describe('with a faulty graph', () => {
    let loader = null;
    before(() => {
      loader = new noflo.ComponentLoader(process.cwd());
      return loader.listComponents()
        .then(() => {
          loader.components.Split = Split;
        });
    });
    it('should fail on connect with non-existing component', () => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Baz');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        componentLoader: loader,
      })
        .then((nw) => nw.connect()
          .then(
            () => Promise.reject(new Error('Unexpected success')),
            (err) => {
              assert.ok(Error.isError(err));
              assert.ok(err.message.includes('not available'));
            },
          ));
    });
    it('should fail on connect with missing target port', () => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'foo');
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        componentLoader: loader,
      })
        .then((nw) => nw.connect()
          .then(
            () => Promise.reject(new Error('Unexpected success')),
            (err) => {
              assert.ok(Error.isError(err));
              assert.ok(err.message.includes('No inport'));
            },
          ));
    });
    it('should fail on connect with missing source port', () => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'foo', 'Repeat2', 'in');
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        componentLoader: loader,
      })
        .then((nw) => nw.connect()
          .then(
            () => Promise.reject(new Error('Unexpected success')),
            (err) => {
              assert.ok(Error.isError(err));
              assert.ok(err.message.includes('No outport'));
            },
          ));
    });
    it('should fail on connect with missing IIP target port', () => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      g.addInitial('hello', 'Repeat1', 'baz');
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        componentLoader: loader,
      })
        .then((nw) => nw.connect()
          .then(
            () => Promise.reject(new Error('Unexpected success')),
            (err) => {
              assert.ok(Error.isError(err));
              assert.ok(err.message.includes('No inport'));
            },
          ));
    });
    it('should fail on connect with node without component', () => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      g.addInitial('hello', 'Repeat1', 'in');
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        componentLoader: loader,
      })
        .then((nw) => nw.connect()
          .then(
            () => Promise.reject(new Error('Unexpected success')),
            (err) => {
              assert.ok(Error.isError(err));
              assert.ok(err.message.includes('No component defined'));
            },
          ));
    });
    it('should fail to add an edge to a missing outbound node', () => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        componentLoader: loader,
      })
        .then((nw) => nw.connect())
        .then((nw) => nw.addEdge({
          from: {
            node: 'Repeat2',
            port: 'out',
          },
          to: {
            node: 'Repeat1',
            port: 'in',
          },
        }))
        .then(
          () => Promise.reject(new Error('Unexpected success')),
          (err) => {
            assert.ok(Error.isError(err));
            assert.ok(err.message.includes('No process defined for outbound node'));
          },
        );
    });
    it('should fail to add an edge to a missing inbound node', () => {
      const g = new noflo.Graph();
      g.addNode('Repeat1', 'Split');
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        componentLoader: loader,
      })
        .then((nw) => nw.connect())
        .then((nw) => nw.addEdge({
          from: {
            node: 'Repeat1',
            port: 'out',
          },
          to: {
            node: 'Repeat2',
            port: 'in',
          },
        }))
        .then(
          () => Promise.reject(new Error('Unexpected success')),
          (err) => {
            assert.ok(Error.isError(err));
            assert.ok(err.message.includes('No process defined for inbound node'));
          },
        );
    });
  });
  describe('baseDir setting', () => {
    it('should set baseDir based on given graph (deprecated)', () => {
      const g = new noflo.Graph();
      g.properties.baseDir = process.cwd();
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
      })
        .then((nw) => {
          assert.strictEqual(nw.baseDir, process.cwd());
        });
    });
    it('should fall back to CWD if graph has no baseDir', function () {
      if (noflo.isBrowser()) {
        this.skip();
        return;
      }
      const g = new noflo.Graph();
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
      })
        .then((nw) => {
          assert.strictEqual(nw.baseDir, process.cwd());
        });
    });
    it('should set the baseDir for the component loader', () => {
      const g = new noflo.Graph();
      return noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false,
        asyncDelivery: false,
        baseDir: process.cwd(),
      })
        .then((nw) => {
          assert.strictEqual(nw.baseDir, process.cwd());
          assert.strictEqual(nw.loader.baseDir, process.cwd());
        });
    });
  });
  describe('debug setting', () => {
    let n = null;
    let g = null;
    before(() => {
      g = new noflo.Graph();
      return noflo.createNetwork(g, {
        subscribeGraph: false,
        asyncDelivery: false,
        delay: true,
        baseDir: process.cwd(),
      })
        .then((network) => {
          n = network;
          n.loader.components.Split = Split;
          return Promise.resolve()
            .then(() => n.addNode({
              id: 'A',
              component: 'Split',
            }))
            .then(() => n.addNode({
              id: 'B',
              component: 'Split',
            }))
            .then(() => n.addEdge({
              from: {
                node: 'A',
                port: 'out',
              },
              to: {
                node: 'B',
                port: 'in',
              },
            }))
            .then(() => network.connect());
        });
    });
    it('should initially have debug enabled', () => {
      assert.equal(n.getDebug(), true);
    });
    it('should have propagated debug setting to connections', () => {
      assert.strictEqual(n.connections[0].debug, n.getDebug());
    });
    it('calling setDebug with same value should be no-op', () => {
      n.setDebug(true);
      assert.equal(n.getDebug(), true);
      assert.strictEqual(n.connections[0].debug, n.getDebug());
    });
    it('disabling debug should get propagated to connections', () => {
      n.setDebug(false);
      assert.equal(n.getDebug(), false);
      assert.strictEqual(n.connections[0].debug, n.getDebug());
    });
  });
});
