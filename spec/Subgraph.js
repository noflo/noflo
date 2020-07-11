/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let chai, noflo, root, urlPrefix;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { chai = require('chai'); }
  noflo = require('../src/lib/NoFlo');
  const path = require('path');
  root = path.resolve(__dirname, '../');
  urlPrefix = './';
} else {
  noflo = require('noflo');
  root = 'noflo';
  urlPrefix = '/';
}

describe('NoFlo Graph component', function() {
  let c = null;
  let g = null;
  let loader = null;
  before(function(done) {
    loader = new noflo.ComponentLoader(root);
    loader.listComponents(done);
  });
  beforeEach(function(done) {
    loader.load('Graph', function(err, instance) {
      if (err) {
        done(err);
        return;
      }
      c = instance;
      g = noflo.internalSocket.createSocket();
      c.inPorts.graph.attach(g);
      done();
    });
  });

  const Split = function() {
    const inst = new noflo.Component;
    inst.inPorts.add('in',
      {datatype: 'all'});
    inst.outPorts.add('out',
      {datatype: 'all'});
    inst.process(function(input, output) {
      const data = input.getData('in');
      output.sendDone({
        out: data});
    });
    return inst;
  };

  const SubgraphMerge = function() {
    const inst = new noflo.Component;
    inst.inPorts.add('in',
      {datatype: 'all'});
    inst.outPorts.add('out',
      {datatype: 'all'});
    inst.forwardBrackets = {};
    inst.process(function(input, output) {
      const packet = input.get('in');
      if (packet.type !== 'data') {
        output.done();
        return;
      }
      output.sendDone({
        out: packet.data});
    });
    return inst;
  };

  describe('initially', function() {
    it('should be ready', function() {
      chai.expect(c.ready).to.be.true;
    });
    it('should not contain a network', function() {
      chai.expect(c.network).to.be.null;
    });
    it('should have a baseDir', function() {
      chai.expect(c.baseDir).to.equal(root);
    });
    it('should only have the graph inport', function() {
      chai.expect(c.inPorts.ports).to.have.keys(['graph']);
      chai.expect(c.outPorts.ports).to.be.empty;
    });
  });
  describe('with JSON graph definition', function() {
    it('should emit a ready event after network has been loaded', function(done) {
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        done();
      });
      c.once('network', function(network) {
        network.loader.components.Split = Split;
        network.loader.registerComponent('', 'Merge', SubgraphMerge);
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send({
        processes: {
          Split: {
            component: 'Split'
          },
          Merge: {
            component: 'Merge'
          }
        }
      });
    });
    it('should expose available ports', function(done) {
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph'
        ]);
        chai.expect(c.outPorts.ports).to.be.empty;
        done();
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send({
        processes: {
          Split: {
            component: 'Split'
          },
          Merge: {
            component: 'Merge'
          }
        },
        connections: [{
          src: {
            process: 'Merge',
            port: 'out'
          },
          tgt: {
            process: 'Split',
            port: 'in'
          }
        }
        ]});
    });
    it('should update description from the graph', function(done) {
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        chai.expect(c.description).to.equal('Hello, World!');
        done();
      });
      c.once('network', function(network) {
        network.loader.components.Split = Split;
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.description).to.equal('Hello, World!');
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send({
        properties: {
          description: 'Hello, World!'
        },
        processes: {
          Split: {
            component: 'Split'
          }
        }
      });
    });
    it('should expose only exported ports when they exist', function(done) {
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph'
        ]);
        chai.expect(c.outPorts.ports).to.have.keys([
          'out'
        ]);
        done();
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send({
        outports: {
          out: {
            process: 'Split',
            port: 'out'
          }
        },
        processes: {
          Split: {
            component: 'Split'
          },
          Merge: {
            component: 'Merge'
          }
        },
        connections: [{
          src: {
            process: 'Merge',
            port: 'out'
          },
          tgt: {
            process: 'Split',
            port: 'in'
          }
        }
        ]});
    });
    it('should be able to run the graph', function(done) {
      c.baseDir = root;
      c.once('ready', function() {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts['in'].attach(ins);
        c.outPorts['out'].attach(out);
        out.on('data', function(data) {
          chai.expect(data).to.equal('Foo');
          done();
        });
        ins.send('Foo');
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send({
        inports: {
          in: {
            process: 'Merge',
            port: 'in'
          }
        },
        outports: {
          out: {
            process: 'Split',
            port: 'out'
          }
        },
        processes: {
          Split: {
            component: 'Split'
          },
          Merge: {
            component: 'Merge'
          }
        },
        connections: [{
          src: {
            process: 'Merge',
            port: 'out'
          },
          tgt: {
            process: 'Split',
            port: 'in'
          }
        }
        ]});
    });
  });
  describe('with a Graph instance', function() {
    let gr = null;
    before(function() {
      gr = new noflo.Graph('Hello, world');
      gr.baseDir = root;
      gr.addNode('Split', 'Split');
      gr.addNode('Merge', 'Merge');
      gr.addEdge('Merge', 'out', 'Split', 'in');
      gr.addInport('in', 'Merge', 'in');
      gr.addOutport('out', 'Split', 'out');
    });
    it('should emit a ready event after network has been loaded', function(done) {
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        done();
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send(gr);
      chai.expect(c.ready).to.be.false;
    });
    it('should expose available ports', function(done) {
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph',
          'in'
        ]);
        chai.expect(c.outPorts.ports).to.have.keys([
          'out'
        ]);
        done();
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send(gr);
    });
    it('should be able to run the graph', function(done) {
      c.baseDir = root;
      let doned = false;
      c.once('ready', function() {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts['in'].attach(ins);
        c.outPorts['out'].attach(out);
        out.on('data', function(data) {
          chai.expect(data).to.equal('Baz');
          if (doned) {
            process.exit(1);
          }
          done();
          doned = true;
        });
        ins.send('Baz');
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send(gr);
    });
  });
  describe('with a FBP file with INPORTs and OUTPORTs', function() {
    const file = `${urlPrefix}spec/fixtures/subgraph.fbp`;
    it('should emit a ready event after network has been loaded', function(done) {
      this.timeout(6000);
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.network).not.to.be.null;
        chai.expect(c.ready).to.be.true;
        done();
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send(file);
      chai.expect(c.ready).to.be.false;
    });
    it('should expose available ports', function(done) {
      this.timeout(6000);
      c.baseDir = root;
      c.once('ready', function() {
        chai.expect(c.inPorts.ports).to.have.keys([
          'graph',
          'in'
        ]);
        chai.expect(c.outPorts.ports).to.have.keys([
          'out'
        ]);
        done();
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send(file);
    });
    it('should be able to run the graph', function(done) {
      c.baseDir = root;
      this.timeout(6000);
      c.once('ready', function() {
        const ins = noflo.internalSocket.createSocket();
        const out = noflo.internalSocket.createSocket();
        c.inPorts['in'].attach(ins);
        c.outPorts['out'].attach(out);
        let received = false;
        out.on('data', function(data) {
          chai.expect(data).to.equal('Foo');
          received = true;
        });
        out.on('disconnect', function() {
          chai.expect(received, 'should have transmitted data').to.equal(true);
          done();
        });
        ins.connect();
        ins.send('Foo');
        ins.disconnect();
      });
      c.once('network', function() {
        chai.expect(c.ready).to.be.false;
        chai.expect(c.network).not.to.be.null;
        c.network.loader.components.Split = Split;
        c.network.loader.components.Merge = SubgraphMerge;
        c.start(function(err) {
          if (err) { done(err); }
        });
      });
      g.send(file);
    });
  });
  describe('when a subgraph is used as a component', function() {

    const createSplit = function() {
      c = new noflo.Component;
      c.inPorts.add('in', {
        required: true,
        datatype: 'string',
        default: 'default-value'
      }
      );
      c.outPorts.add('out',
        {datatype: 'string'});
      c.process(function(input, output) {
        const data = input.getData('in');
        output.sendDone({
          out: data});
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
    before(function(done) {
      this.timeout(6000);
      cl = new noflo.ComponentLoader(root);
      cl.listComponents(function(err, components) {
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

    it('should send defaults', function(done) {
      cl.load('Defaults', function(err, inst) {
        const o = noflo.internalSocket.createSocket();
        inst.outPorts.out.attach(o);
        o.once('data', function(data) {
          chai.expect(data).to.equal('default-value');
          done();
        });
        inst.start(function(err) {
          if (err) {
            done(err);
            return;
          }
        });
      });
    });

    it('should send initials', function(done) {
      cl.load('Initials', function(err, inst) {
        const o = noflo.internalSocket.createSocket();
        inst.outPorts.out.attach(o);
        o.once('data', function(data) {
          chai.expect(data).to.equal('initial-value');
          done();
        });
        inst.start(function(err) {
          if (err) {
            done(err);
            return;
          }
        });
      });
    });

    it('should not send defaults when an inport is attached externally', function(done) {
      cl.load('Defaults', function(err, inst) {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        o.once('data', function(data) {
          chai.expect(data).to.equal('Foo');
          done();
        });
        inst.start(function(err) {
          if (err) {
            done(err);
            return;
          }
        });
        i.send('Foo');
      });
    });

    it('should deactivate after processing is complete', function(done) {
      cl.load('Defaults', function(err, inst) {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        const expected = [
          'ACTIVATE 1',
          'data Foo',
          'DEACTIVATE 0'
        ];
        const received = [];
        o.on('ip', function(ip) {
          received.push(`${ip.type} ${ip.data}`);
        });
        inst.on('activate', function(load) {
          received.push(`ACTIVATE ${load}`);
        });
        inst.on('deactivate', function(load) {
          received.push(`DEACTIVATE ${load}`);
          if (received.length !== expected.length) { return; }
          chai.expect(received).to.eql(expected);
          done();
        });
        inst.start(function(err) {
          if (err) {
            done(err);
            return;
          }
          i.send('Foo');
        });
      });
    });

    it.skip('should activate automatically when receiving data', function(done) {
      cl.load('Defaults', function(err, inst) {
        const i = noflo.internalSocket.createSocket();
        const o = noflo.internalSocket.createSocket();
        inst.inPorts.in.attach(i);
        inst.outPorts.out.attach(o);
        const expected = [
          'ACTIVATE 1',
          'data Foo',
          'DEACTIVATE 0'
        ];
        const received = [];
        o.on('ip', ip => received.push(`${ip.type} ${ip.data}`));
        inst.on('activate', load => received.push(`ACTIVATE ${load}`));
        inst.on('deactivate', function(load) {
          received.push(`DEACTIVATE ${load}`);
          if (received.length !== expected.length) { return; }
          chai.expect(received).to.eql(expected);
          done();
        });
        i.send('Foo');
      });
    });

    it('should reactivate when receiving new data packets', function(done) {
      cl.load('Defaults', function(err, inst) {
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
          'DEACTIVATE 0'
        ];
        const received = [];
        const send = [
          ['Foo'],
          ['Bar', 'Baz'],
          ['Foobar']
        ];
        const sendNext = function() {
          if (!send.length) { return; }
          const sends = send.shift();
          for (let d of Array.from(sends)) { i.post(new noflo.IP('data', d)); }
        };
        o.on('ip', function(ip) {
          received.push(`${ip.type} ${ip.data}`);
        });
        inst.on('activate', function(load) {
          received.push(`ACTIVATE ${load}`);
        });
        inst.on('deactivate', function(load) {
          received.push(`DEACTIVATE ${load}`);
          sendNext();
          if (received.length !== expected.length) { return; }
          chai.expect(received).to.eql(expected);
          done();
        });
        inst.start(function(err) {
          if (err) {
            done(err);
            return;
          }
          sendNext();
        });
      });
    });
  });
  describe('event forwarding on parent network', function() {
    describe('with a single level subgraph', function() {
      let graph = null;
      let network = null;
      before(function(done) {
        graph = new noflo.Graph('main');
        graph.baseDir = root;
        noflo.createNetwork(graph, {
          delay: true,
          subscribeGraph: false
        }
        , function(err, nw) {
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
          network.loader.registerGraph('foo', 'AB', sg, function(err) {
            if (err) {
              done(err);
              return;
            }
            network.connect(done);
          });
        });
      });
      it('should instantiate the subgraph when node is added', function(done) {
        network.addNode({
          id: 'Sub',
          component: 'foo/AB'
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          network.addNode({
            id: 'Split',
            component: 'Split'
          }
          , function(err) {
            if (err) {
              done(err);
              return;
            }
            network.addEdge({
              from: {
                node: 'Sub',
                port: 'out'
              },
              to: {
                node: 'Split',
                port: 'in'
              }
            }
            , function(err) {
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
      it('should be possible to start the graph', function(done) {
        network.start(done);
      });
      it('should forward IP events', function(done) {
        network.once('ip', function(ip) {
          chai.expect(ip.id).to.equal('DATA -> IN Sub()');
          chai.expect(ip.type).to.equal('data');
          chai.expect(ip.data).to.equal('foo');
          chai.expect(ip.subgraph).to.be.undefined;
          network.once('ip', function(ip) {
            chai.expect(ip.id).to.equal('A() OUT -> IN B()');
            chai.expect(ip.type).to.equal('data');
            chai.expect(ip.data).to.equal('foo');
            chai.expect(ip.subgraph).to.eql([
              'Sub'
            ]);
            network.once('ip', function(ip) {
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
            data: 'foo'
          },
          to: {
            node: 'Sub',
            port: 'in'
          }
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
        });
      });
    });
    describe('with two levels of subgraphs', function() {
      let graph = null;
      let network = null;
      before(function(done) {
        graph = new noflo.Graph('main');
        graph.baseDir = root;
        noflo.createNetwork(graph, {
          delay: true,
          subscribeGraph: false
        }
        , function(err, net) {
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
          network.loader.registerGraph('foo', 'AB', sg, function(err) {
            if (err) {
              done(err);
              return;
            }
            network.loader.registerGraph('foo', 'AB2', sg2, function(err) {
              if (err) {
                done(err);
                return;
              }
              network.connect(done);
            });
          });
        });
      });
      it('should instantiate the subgraphs when node is added', function(done) {
        network.addNode({
          id: 'Sub',
          component: 'foo/AB2'
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          network.addNode({
            id: 'Split',
            component: 'Split'
          }
          , function(err) {
            if (err) {
              done(err);
              return;
            }
            network.addEdge({
              from: {
                node: 'Sub',
                port: 'out'
              },
              to: {
                node: 'Split',
                port: 'in'
              }
            }
            , function(err) {
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
      it('should be possible to start the graph', function(done) {
        network.start(done);
      });
      it('should forward IP events', function(done) {
        network.once('ip', function(ip) {
          chai.expect(ip.id).to.equal('DATA -> IN Sub()');
          chai.expect(ip.type).to.equal('data');
          chai.expect(ip.data).to.equal('foo');
          chai.expect(ip.subgraph).to.be.undefined;
          network.once('ip', function(ip) {
            chai.expect(ip.id).to.equal('A() OUT -> IN B()');
            chai.expect(ip.type).to.equal('data');
            chai.expect(ip.data).to.equal('foo');
            chai.expect(ip.subgraph).to.eql([
              'Sub',
              'A'
            ]);
            network.once('ip', function(ip) {
              chai.expect(ip.id).to.equal('A() OUT -> IN B()');
              chai.expect(ip.type).to.equal('data');
              chai.expect(ip.data).to.equal('foo');
              chai.expect(ip.subgraph).to.eql([
                'Sub'
              ]);
              network.once('ip', function(ip) {
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
            data: 'foo'
          },
          to: {
            node: 'Sub',
            port: 'in'
          }
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
        });
      });
    });
  });
});
