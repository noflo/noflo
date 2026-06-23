import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import flowtrace from 'flowtrace';
import * as noflo from '../src/lib/NoFlo.js';

let loadingPrefix;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  loadingPrefix = './';
} else {
  loadingPrefix = '/base/';
}
describe('NoFlo Graph component', () => {
  let c = null;
  let g = null;
  let loader = null;
  before(() => {
    loader = new noflo.ComponentLoader(process.cwd());
    return loader.listComponents();
  });
  beforeEach(() => loader
    .load('Graph')
    .then((instance) => {
      c = instance;
      g = noflo.internalSocket.createSocket();
      c.inPorts.graph.attach(g);
    }));

  const Split = function () {
    const inst = new noflo.Component();
    inst.inPorts.add('in',
      { datatype: 'all' });
    inst.outPorts.add('out',
      { datatype: 'all' });
    inst.process((input, output) => {
      const data = input.getData('in');
      output.sendDone({ out: data });
    });
    return inst;
  };

  const SubgraphMerge = function () {
    const inst = new noflo.Component();
    inst.inPorts.add('in',
      { datatype: 'all' });
    inst.outPorts.add('out',
      { datatype: 'all' });
    inst.forwardBrackets = {};
    inst.process((input, output) => {
      const packet = input.get('in');
      if (packet.type !== 'data') {
        output.done();
        return;
      }
      output.sendDone({ out: packet.data });
    });
    return inst;
  };

  describe('initially', () => {
    it('should be ready', () => {
      assert.strictEqual(c.ready, true);
    });
    it('should not contain a network', () => {
      assert.strictEqual(c.network, null);
    });
    it('should have a baseDir', () => {
      assert.strictEqual(c.baseDir, process.cwd());
    });
    it('should only have the graph inport', () => {
      assert.deepEqual(Object.keys(c.inPorts.ports), ['graph']);
      assert.deepEqual(Object.keys(c.outPorts.ports), []);
    });
  });
  describe('with JSON graph definition', () => {
    it('should emit a ready event after network has been loaded', (t, done) => {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        done();
      });
      c.once('network', (network) => {
        network.loader.components.Split = Split;
        network.loader.registerComponent('', 'Merge', SubgraphMerge);
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send({
        processes: {
          Split: {
            component: 'Split',
          },
          Merge: {
            component: 'Merge',
          },
        },
      });
    });
    it('should expose available ports', (t, done) => {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), [
          'graph',
        ]);
        assert.deepEqual(Object.keys(c.outPorts.ports), []);
        done();
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send({
        processes: {
          Split: {
            component: 'Split',
          },
          Merge: {
            component: 'Merge',
          },
        },
        connections: [{
          src: {
            process: 'Merge',
            port: 'out',
          },
          tgt: {
            process: 'Split',
            port: 'in',
          },
        },
        ],
      });
    });
    it('should update description from the graph', (t, done) => {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        assert.strictEqual(c.description, 'Hello, World!');
        done();
      });
      c.once('network', (network) => {
        network.loader.components.Split = Split;
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        assert.strictEqual(c.description, 'Hello, World!');
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send({
        properties: {
          description: 'Hello, World!',
        },
        processes: {
          Split: {
            component: 'Split',
          },
        },
      });
    });
    it('should expose only exported ports when they exist', (t, done) => {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), [
          'graph',
        ]);
        assert.deepEqual(Object.keys(c.outPorts.ports), [
          'out',
        ]);
        done();
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send({
        outports: {
          out: {
            process: 'Split',
            port: 'out',
          },
        },
        processes: {
          Split: {
            component: 'Split',
          },
          Merge: {
            component: 'Merge',
          },
        },
        connections: [{
          src: {
            process: 'Merge',
            port: 'out',
          },
          tgt: {
            process: 'Split',
            port: 'in',
          },
        },
        ],
      });
    });
    it('should be able to run the graph', (t, done) => {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        out.on('data', (data) => {
          assert.strictEqual(data, 'Foo');
          done();
        });
        ins.send('Foo');
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send({
        inports: {
          in: {
            process: 'Merge',
            port: 'in',
          },
        },
        outports: {
          out: {
            process: 'Split',
            port: 'out',
          },
        },
        processes: {
          Split: {
            component: 'Split',
          },
          Merge: {
            component: 'Merge',
          },
        },
        connections: [{
          src: {
            process: 'Merge',
            port: 'out',
          },
          tgt: {
            process: 'Split',
            port: 'in',
          },
        },
        ],
      });
    });
  });
  describe('with a Graph instance', () => {
    let gr = null;
    before(() => {
      gr = new noflo.Graph('Hello, world');
      gr.baseDir = process.cwd();
      gr.addNode('Split', 'Split');
      gr.addNode('Merge', 'Merge');
      gr.addEdge('Merge', 'out', 'Split', 'in');
      gr.addInport('in', 'Merge', 'in');
      gr.addOutport('out', 'Split', 'out');
    });
    it('should emit a ready event after network has been loaded', (t, done) => {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        done();
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(gr);
      assert.strictEqual(c.ready, false);
    });
    it('should expose available ports', (t, done) => {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), [
          'graph',
          'in',
        ]);
        assert.deepEqual(Object.keys(c.outPorts.ports), [
          'out',
        ]);
        done();
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(gr);
    });
    it('should be able to run the graph', (t, done) => {
      c.baseDir = process.cwd();
      let doned = false;
      c.once('ready', () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        out.on('data', (data) => {
          assert.strictEqual(data, 'Baz');
          if (doned) {
            process.exit(1);
          }
          done();
          doned = true;
        });
        ins.send('Baz');
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(gr);
    });
  });
  describe('with a FBP file with INPORTs and OUTPORTs', () => {
    const file = `${loadingPrefix}spec/fixtures/subgraph.fbp`;
    it('should emit a ready event after network has been loaded', function (t, done) {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.notEqual(c.network, null);
        assert.strictEqual(c.ready, true);
        done();
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(file);
      assert.strictEqual(c.ready, false);
    });
    it('should expose available ports', function (t, done) {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        assert.deepEqual(Object.keys(c.inPorts.ports), [
          'graph',
          'in',
        ]);
        assert.deepEqual(Object.keys(c.outPorts.ports), [
          'out',
        ]);
        done();
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(file);
    });
    it('should be able to run the graph', function (t, done) {
      c.baseDir = process.cwd();
      c.once('ready', () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        let received = false;
        out.on('data', (data) => {
          assert.strictEqual(data, 'Foo');
          received = true;
        });
        out.on('disconnect', () => {
          assert.strictEqual(received, true, 'should have transmitted data');
          done();
        });
        ins.connect();
        ins.send('Foo');
        ins.disconnect();
      });
      c.once('network', () => {
        assert.strictEqual(c.ready, false);
        assert.notEqual(c.network, null);
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(file);
    });
  });
  describe('when a subgraph is used as a component', () => {
    const createSplit = function () {
      c = new noflo.Component();
      c.inPorts.add('in', {
        required: true,
        datatype: 'string',
        default: 'default-value',
      });
      c.outPorts.add('out',
        { datatype: 'string' });
      c.process((input, output) => {
        const data = input.getData('in');
        output.sendDone({ out: data });
      });
      return c;
    };

    const grDefaults = new noflo.Graph('Child Graph Using Defaults');
    grDefaults.addNode('SplitIn', 'Split');
    grDefaults.addNode('SplitOut', 'Split');
    grDefaults.addInport('in', 'SplitIn', 'in');
    grDefaults.addOutport('out', 'SplitOut', 'out');
    grDefaults.addEdge('SplitIn', 'out', 'SplitOut', 'in');

    const grInitials = new noflo.Graph('Child Graph Using Initials');
    grInitials.addNode('SplitIn', 'Split');
    grInitials.addNode('SplitOut', 'Split');
    grInitials.addInport('in', 'SplitIn', 'in');
    grInitials.addOutport('out', 'SplitOut', 'out');
    grInitials.addInitial('initial-value', 'SplitIn', 'in');
    grInitials.addEdge('SplitIn', 'out', 'SplitOut', 'in');

    let cl = null;
    before(function () {
      cl = new noflo.ComponentLoader(process.cwd());
      return cl.listComponents()
        .then(() => {
          cl.components.Split = createSplit;
          cl.components.Defaults = grDefaults;
          cl.components.Initials = grInitials;
        });
    });

    it('should send defaults', (t, done) => {
      cl.load('Defaults', (err, inst) => {
        const o = noflo.internalSocket.createSocket();
        inst.outPorts.out.attach(o);
        o.once('data', (data) => {
          assert.strictEqual(data, 'default-value');
          done();
        });
        inst.start((err) => {
          if (err) {
            done(err);
          }
        });
      });
    });

    it('should send initials', (t, done) => {
      cl.load('Initials', (err, inst) => {
        const o = noflo.internalSocket.createSocket();
        inst.outPorts.out.attach(o);
        o.once('data', (data) => {
          assert.strictEqual(data, 'initial-value');
          done();
        });
        inst.start((err) => {
          if (err) {
            done(err);
          }
        });
      });
    });

    it('should not send defaults when an inport is attached externally', (t, done) => {
      cl.load('Defaults', (err, inst) => {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        o.once('data', (data) => {
          assert.strictEqual(data, 'Foo');
          done();
        });
        inst.start((err) => {
          if (err) {
            done(err);
          }
        });
        i.send('Foo');
      });
    });

    it('should deactivate after processing is complete', (t, done) => {
      cl.load('Defaults', (err, inst) => {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        const expected = [
          'ACTIVATE 1',
          'data Foo',
          'DEACTIVATE 0',
        ];
        const received = [];
        o.on('ip', (ip) => {
          received.push(`${ip.type} ${ip.data}`);
        });
        inst.on('activate', (load) => {
          received.push(`ACTIVATE ${load}`);
        });
        inst.on('deactivate', (load) => {
          received.push(`DEACTIVATE ${load}`);
          if (received.length !== expected.length) { return; }
          assert.deepStrictEqual(received, expected);
          done();
        });
        inst.start((err) => {
          if (err) {
            done(err);
            return;
          }
          i.send('Foo');
        });
      });
    });

    it.skip('should activate automatically when receiving data', (t, done) => {
      cl.load('Defaults', (err, inst) => {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        const expected = [
          'ACTIVATE 1',
          'data Foo',
          'DEACTIVATE 0',
        ];
        const received = [];
        o.on('ip', (ip) => received.push(`${ip.type} ${ip.data}`));
        inst.on('activate', (load) => received.push(`ACTIVATE ${load}`));
        inst.on('deactivate', (load) => {
          received.push(`DEACTIVATE ${load}`);
          if (received.length !== expected.length) { return; }
          assert.deepStrictEqual(received, expected);
          done();
        });
        i.send('Foo');
      });
    });

    it('should reactivate when receiving new data packets', (t, done) => {
      cl.load('Defaults', (err, inst) => {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        const expected = [
          'ACTIVATE 1',
          'data Foo',
          'DEACTIVATE 0',
          'ACTIVATE 1',
          'data Bar',
          'data Baz',
          'DEACTIVATE 0',
          'ACTIVATE 1',
          'data Foobar',
          'DEACTIVATE 0',
        ];
        const received = [];
        const send = [
          ['Foo'],
          ['Bar', 'Baz'],
          ['Foobar'],
        ];
        const sendNext = function () {
          if (!send.length) { return; }
          const sends = send.shift();
          for (const d of sends) { i.post(new noflo.IP('data', d)); }
        };
        o.on('ip', (ip) => {
          received.push(`${ip.type} ${ip.data}`);
        });
        inst.on('activate', (load) => {
          received.push(`ACTIVATE ${load}`);
        });
        inst.on('deactivate', (load) => {
          received.push(`DEACTIVATE ${load}`);
          sendNext();
          if (received.length !== expected.length) { return; }
          assert.deepStrictEqual(received, expected);
          done();
        });
        inst.start((err) => {
          if (err) {
            done(err);
            return;
          }
          sendNext();
        });
      });
    });
  });
  describe('event forwarding on parent network', () => {
    describe('with a single level subgraph', () => {
      let graph = null;
      let network = null;
      before((t, done) => {
        graph = new noflo.Graph('main');
        graph.baseDir = process.cwd();
        noflo.createNetwork(graph, {
          delay: true,
          subscribeGraph: false,
        },
        (err, nw) => {
          if (err) {
            done(err);
            return;
          }
          network = nw;
          network.loader.components.Split = Split;
          network.loader.components.Merge = SubgraphMerge;
          const sg = new noflo.Graph('Subgraph');
          sg.addNode('A', 'Split');
          sg.addNode('B', 'Merge');
          sg.addEdge('A', 'out', 'B', 'in');
          sg.addInport('in', 'A', 'in');
          sg.addOutport('out', 'B', 'out');
          network.loader.registerGraph('foo', 'AB', sg, (err) => {
            if (err) {
              done(err);
              return;
            }
            network.connect(done);
          });
        });
      });
      it('should instantiate the subgraph when node is added', (t, done) => {
        network.addNode({
          id: 'Sub',
          component: 'foo/AB',
        },
        (err) => {
          if (err) {
            done(err);
            return;
          }
          network.addNode({
            id: 'Split',
            component: 'Split',
          },
          (err) => {
            if (err) {
              done(err);
              return;
            }
            network.addEdge({
              from: {
                node: 'Sub',
                port: 'out',
              },
              to: {
                node: 'Split',
                port: 'in',
              },
            },
            (err) => {
              if (err) {
                done(err);
                return;
              }
              assert.ok(Object.keys(network.processes).length > 0);
              assert.ok(network.processes.Sub);
              done();
            });
          });
        });
      });
      it('should be possible to start the graph', (t, done) => {
        network.start(done);
      });
      it('should forward IP events', (t, done) => {
        network.once('ip', (ip) => {
          assert.strictEqual(ip.id, 'DATA -> IN Sub()');
          assert.strictEqual(ip.type, 'data');
          assert.strictEqual(ip.data, 'foo');
          assert.strictEqual(ip.subgraph, undefined);
          network.once('ip', (ip) => {
            assert.strictEqual(ip.id, 'A() OUT -> IN B()');
            assert.strictEqual(ip.type, 'data');
            assert.strictEqual(ip.data, 'foo');
            assert.deepStrictEqual(ip.subgraph, [
              'Sub',
            ]);
            network.once('ip', (ip) => {
              assert.strictEqual(ip.id, 'Sub() OUT -> IN Split()');
              assert.strictEqual(ip.type, 'data');
              assert.strictEqual(ip.data, 'foo');
              assert.strictEqual(ip.subgraph, undefined);
              done();
            });
          });
        });
        network.addInitial({
          from: {
            data: 'foo',
          },
          to: {
            node: 'Sub',
            port: 'in',
          },
        },
        (err) => {
          if (err) {
            done(err);
          }
        });
      });
    });
    describe('with two levels of subgraphs', () => {
      let graph = null;
      let network = null;
      const trace = new flowtrace.Flowtrace();
      before((t, done) => {
        graph = new noflo.Graph('main');
        graph.baseDir = process.cwd();
        noflo.createNetwork(graph, {
          delay: true,
          subscribeGraph: false,
          flowtrace: trace,
        },
        (err, net) => {
          if (err) {
            done(err);
            return;
          }
          network = net;
          network.loader.components.Split = Split;
          network.loader.components.Merge = SubgraphMerge;
          const sg = new noflo.Graph('Subgraph');
          sg.addNode('A', 'Split');
          sg.addNode('B', 'Merge');
          sg.addEdge('A', 'out', 'B', 'in');
          sg.addInport('in', 'A', 'in');
          sg.addOutport('out', 'B', 'out');
          const sg2 = new noflo.Graph('Subgraph');
          sg2.addNode('A', 'foo/AB');
          sg2.addNode('B', 'Merge');
          sg2.addEdge('A', 'out', 'B', 'in');
          sg2.addInport('in', 'A', 'in');
          sg2.addOutport('out', 'B', 'out');
          network.loader.registerGraph('foo', 'AB', sg, (err) => {
            if (err) {
              done(err);
              return;
            }
            network.loader.registerGraph('foo', 'AB2', sg2, (err) => {
              if (err) {
                done(err);
                return;
              }
              network.connect(done);
            });
          });
        });
      });
      it('should instantiate the subgraphs when node is added', (t, done) => {
        network.addNode({
          id: 'Sub',
          component: 'foo/AB2',
        },
        (err) => {
          if (err) {
            done(err);
            return;
          }
          network.addNode({
            id: 'Split',
            component: 'Split',
          },
          (err) => {
            if (err) {
              done(err);
              return;
            }
            network.addEdge({
              from: {
                node: 'Sub',
                port: 'out',
              },
              to: {
                node: 'Split',
                port: 'in',
              },
            },
            (err) => {
              if (err) {
                done(err);
                return;
              }
              assert.ok(Object.keys(network.processes).length > 0);
              assert.ok(network.processes.Sub);
              done();
            });
          });
        });
      });
      it('should be possible to start the graph', (t, done) => {
        network.start(done);
      });
      it('should forward IP events', (t, done) => {
        network.once('ip', (ip) => {
          assert.strictEqual(ip.id, 'DATA -> IN Sub()');
          assert.strictEqual(ip.type, 'data');
          assert.strictEqual(ip.data, 'foo');
          assert.strictEqual(ip.subgraph, undefined);
          network.once('ip', (ip) => {
            assert.strictEqual(ip.id, 'A() OUT -> IN B()');
            assert.strictEqual(ip.type, 'data');
            assert.strictEqual(ip.data, 'foo');
            assert.deepStrictEqual(ip.subgraph, [
              'Sub',
              'A',
            ]);
            network.once('ip', (ip) => {
              assert.strictEqual(ip.id, 'A() OUT -> IN B()');
              assert.strictEqual(ip.type, 'data');
              assert.strictEqual(ip.data, 'foo');
              assert.deepStrictEqual(ip.subgraph, [
                'Sub',
              ]);
              network.once('ip', (ip) => {
                assert.strictEqual(ip.id, 'Sub() OUT -> IN Split()');
                assert.strictEqual(ip.type, 'data');
                assert.strictEqual(ip.data, 'foo');
                assert.strictEqual(ip.subgraph, undefined);
                done();
              });
            });
          });
        });
        network.addInitial({
          from: {
            data: 'foo',
          },
          to: {
            node: 'Sub',
            port: 'in',
          },
        },
        (err) => {
          if (err) {
            done(err);
          }
        });
      });
      it('should finish', (t, done) => {
        network.once('end', () => {
          done();
        });
      });
      it('should produce a Flowtrace with both graphs included', () => {
        const collectedTrace = trace.toJSON();
        assert.deepEqual(Object.keys(collectedTrace.header.graphs), [
          'main',
          'foo/AB2',
          'foo/AB',
        ], 'should have exported all graphs');
        const eventTypes = collectedTrace.events.map((e) => `${e.protocol}:${e.command}`);
        assert.deepStrictEqual(eventTypes, [
          'network:started',
          'network:data',
          'network:data',
          'network:data',
          'network:data',
          'network:stopped',
        ]);
        const subgraphs = collectedTrace.events.map((e) => {
          const s = e.payload.subgraph ? e.payload.subgraph.join(':') : '';
          return s;
        });
        assert.deepStrictEqual(subgraphs, [
          '',
          '',
          'Sub:A',
          'Sub',
          '',
          '',
        ]);
      });
    });
  });
});
