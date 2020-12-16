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
    loader = new noflo.ComponentLoader(baseDir);
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
      chai.expect(c.ready).to.be.true;
    });
    it('should not contain a network', () => {
      chai.expect(c.network).to.be.null;
    });
    it('should have a baseDir', () => {
      chai.expect(c.baseDir).to.equal(baseDir);
    });
    it('should only have the graph inport', () => {
      chai.expect(c.inPorts.ports).to.have.keys(['graph']);
      chai.expect(c.outPorts.ports).to.be.empty;
    });
  });
  describe('with JSON graph definition', () => {
    it('should emit a ready event after network has been loaded', (done) => {
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        done();
      });
      c.once('network', (network) => {
        network.loader.components.Split = Split;
        network.loader.registerComponent('', 'Merge', SubgraphMerge);
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
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
    it('should expose available ports', (done) => {
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph',
        ]);
        chai.expect(c.outPorts.ports).to.be.empty;
        done();
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
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
    it('should update description from the graph', (done) => {
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        chai.expect(c.description).to.equal('Hello, World!');
        done();
      });
      c.once('network', (network) => {
        network.loader.components.Split = Split;
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.description).to.equal('Hello, World!');
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
    it('should expose only exported ports when they exist', (done) => {
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph',
        ]);
        chai.expect(c.outPorts.ports).to.have.keys([
          'out',
        ]);
        done();
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
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
    it('should be able to run the graph', (done) => {
      c.baseDir = baseDir;
      c.once('ready', () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        out.on('data', (data) => {
          chai.expect(data).to.equal('Foo');
          done();
        });
        ins.send('Foo');
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
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
      gr.baseDir = baseDir;
      gr.addNode('Split', 'Split');
      gr.addNode('Merge', 'Merge');
      gr.addEdge('Merge', 'out', 'Split', 'in');
      gr.addInport('in', 'Merge', 'in');
      gr.addOutport('out', 'Split', 'out');
    });
    it('should emit a ready event after network has been loaded', (done) => {
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        done();
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(gr);
      chai.expect(c.ready).to.be.false;
    });
    it('should expose available ports', (done) => {
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph',
          'in',
        ]);
        chai.expect(c.outPorts.ports).to.have.keys([
          'out',
        ]);
        done();
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(gr);
    });
    it('should be able to run the graph', (done) => {
      c.baseDir = baseDir;
      let doned = false;
      c.once('ready', () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        out.on('data', (data) => {
          chai.expect(data).to.equal('Baz');
          if (doned) {
            process.exit(1);
          }
          done();
          doned = true;
        });
        ins.send('Baz');
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
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
    it('should emit a ready event after network has been loaded', function (done) {
      this.timeout(6000);
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        done();
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(file);
      chai.expect(c.ready).to.be.false;
    });
    it('should expose available ports', function (done) {
      this.timeout(6000);
      c.baseDir = baseDir;
      c.once('ready', () => {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph',
          'in',
        ]);
        chai.expect(c.outPorts.ports).to.have.keys([
          'out',
        ]);
        done();
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start((err) => {
          if (err) { done(err); }
        });
      });
      g.send(file);
    });
    it('should be able to run the graph', function (done) {
      c.baseDir = baseDir;
      this.timeout(6000);
      c.once('ready', () => {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts.in.attach(ins);
        c.outPorts.out.attach(out);
        let received = false;
        out.on('data', (data) => {
          chai.expect(data).to.equal('Foo');
          received = true;
        });
        out.on('disconnect', () => {
          chai.expect(received, 'should have transmitted data').to.equal(true);
          done();
        });
        ins.connect();
        ins.send('Foo');
        ins.disconnect();
      });
      c.once('network', () => {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
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
    before(function (done) {
      this.timeout(6000);
      cl = new noflo.ComponentLoader(baseDir);
      cl.listComponents((err) => {
        if (err) {
          done(err);
          return;
        }
        cl.components.Split = createSplit;
        cl.components.Defaults = grDefaults;
        cl.components.Initials = grInitials;
        done();
      });
    });

    it('should send defaults', (done) => {
      cl.load('Defaults', (err, inst) => {
        const o = noflo.internalSocket.createSocket();
        inst.outPorts.out.attach(o);
        o.once('data', (data) => {
          chai.expect(data).to.equal('default-value');
          done();
        });
        inst.start((err) => {
          if (err) {
            done(err);
          }
        });
      });
    });

    it('should send initials', (done) => {
      cl.load('Initials', (err, inst) => {
        const o = noflo.internalSocket.createSocket();
        inst.outPorts.out.attach(o);
        o.once('data', (data) => {
          chai.expect(data).to.equal('initial-value');
          done();
        });
        inst.start((err) => {
          if (err) {
            done(err);
          }
        });
      });
    });

    it('should not send defaults when an inport is attached externally', (done) => {
      cl.load('Defaults', (err, inst) => {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        o.once('data', (data) => {
          chai.expect(data).to.equal('Foo');
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

    it('should deactivate after processing is complete', (done) => {
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
          chai.expect(received).to.eql(expected);
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

    it.skip('should activate automatically when receiving data', (done) => {
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
          chai.expect(received).to.eql(expected);
          done();
        });
        i.send('Foo');
      });
    });

    it('should reactivate when receiving new data packets', (done) => {
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
          chai.expect(received).to.eql(expected);
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
      before((done) => {
        graph = new noflo.Graph('main');
        graph.baseDir = baseDir;
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
      it('should instantiate the subgraph when node is added', (done) => {
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
              chai.expect(network.processes).not.to.be.empty;
              chai.expect(network.processes.Sub).to.exist;
              done();
            });
          });
        });
      });
      it('should be possible to start the graph', (done) => {
        network.start(done);
      });
      it('should forward IP events', (done) => {
        network.once('ip', (ip) => {
          chai.expect(ip.id).to.equal('DATA -> IN Sub()');
          chai.expect(ip.type).to.equal('data');
          chai.expect(ip.data).to.equal('foo');
          chai.expect(ip.subgraph).to.be.undefined;
          network.once('ip', (ip) => {
            chai.expect(ip.id).to.equal('A() OUT -> IN B()');
            chai.expect(ip.type).to.equal('data');
            chai.expect(ip.data).to.equal('foo');
            chai.expect(ip.subgraph).to.eql([
              'Sub',
            ]);
            network.once('ip', (ip) => {
              chai.expect(ip.id).to.equal('Sub() OUT -> IN Split()');
              chai.expect(ip.type).to.equal('data');
              chai.expect(ip.data).to.equal('foo');
              chai.expect(ip.subgraph).to.be.undefined;
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
      before((done) => {
        graph = new noflo.Graph('main');
        graph.baseDir = baseDir;
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
      it('should instantiate the subgraphs when node is added', (done) => {
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
              chai.expect(network.processes).not.to.be.empty;
              chai.expect(network.processes.Sub).to.exist;
              done();
            });
          });
        });
      });
      it('should be possible to start the graph', (done) => {
        network.start(done);
      });
      it('should forward IP events', (done) => {
        network.once('ip', (ip) => {
          chai.expect(ip.id).to.equal('DATA -> IN Sub()');
          chai.expect(ip.type).to.equal('data');
          chai.expect(ip.data).to.equal('foo');
          chai.expect(ip.subgraph).to.be.undefined;
          network.once('ip', (ip) => {
            chai.expect(ip.id).to.equal('A() OUT -> IN B()');
            chai.expect(ip.type).to.equal('data');
            chai.expect(ip.data).to.equal('foo');
            chai.expect(ip.subgraph).to.eql([
              'Sub',
              'A',
            ]);
            network.once('ip', (ip) => {
              chai.expect(ip.id).to.equal('A() OUT -> IN B()');
              chai.expect(ip.type).to.equal('data');
              chai.expect(ip.data).to.equal('foo');
              chai.expect(ip.subgraph).to.eql([
                'Sub',
              ]);
              network.once('ip', (ip) => {
                chai.expect(ip.id).to.equal('Sub() OUT -> IN Split()');
                chai.expect(ip.type).to.equal('data');
                chai.expect(ip.data).to.equal('foo');
                chai.expect(ip.subgraph).to.be.undefined;
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
      it('should finish', (done) => {
        network.once('end', () => {
          done();
        });
      });
      it('should produce a Flowtrace with both graphs included', () => {
        const collectedTrace = trace.toJSON();
        chai.expect(Object.keys(collectedTrace.header.graphs), 'should have exported all graphs').to.eql([
          'main',
          'foo/AB2',
          'foo/AB',
        ]);
        const eventTypes = collectedTrace.events.map((e) => `${e.protocol}:${e.command}`);
        chai.expect(eventTypes).to.eql([
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
        chai.expect(subgraphs).to.eql([
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
