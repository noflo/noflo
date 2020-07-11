let chai, noflo, root;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { chai = require('chai'); }
  noflo = require('../src/lib/NoFlo');
  const path = require('path');
  root = path.resolve(__dirname, '../');
} else {
  noflo = require('noflo');
  root = 'noflo';
}

describe('NoFlo Network', function() {
  const Split = () => new noflo.Component({
    inPorts: {
      in: {datatype: 'all'}
    },
    outPorts: {
      out: {datatype: 'all'}
    },
    process(input, output) {
      output.sendDone({
        out: input.get('in')});
    }
  });
  const Merge = () => new noflo.Component({
    inPorts: {
      in: {datatype: 'all'}
    },
    outPorts: {
      out: {datatype: 'all'}
    },
    process(input, output) {
      output.sendDone({
        out: input.get('in')});
    }
  });
  const Callback = () => new noflo.Component({
    inPorts: {
      in: { datatype: 'all'
    },
      callback: {
        datatype: 'all',
        control: true
      }
    },
    process(input, output) {
      // Drop brackets
      if (!input.hasData('callback', 'in')) { return; }
      const cb = input.getData('callback');
      const data = input.getData('in');
      cb(data);
      output.done();
    }
  });
  describe('with an empty graph', function() {
    let g = null;
    let n = null;
    before(function(done) {
      g = new noflo.Graph;
      g.baseDir = root;
      noflo.createNetwork(g, {
        subscribeGraph: false,
        delay: true
      }
      , function(err, network) {
        if (err) {
          done(err);
          return;
        }
        n = network;
        n.connect(done);
      });
    });
    it('should initially be marked as stopped', function() {
      chai.expect(n.isStarted()).to.equal(false);
    });
    it('should initially have no processes', function() {
      chai.expect(n.processes).to.be.empty;
    });
    it('should initially have no active processes', function() {
      chai.expect(n.getActiveProcesses()).to.eql([]);
    });
    it('should initially have to connections', function() {
      chai.expect(n.connections).to.be.empty;
    });
    it('should initially have no IIPs', function() {
      chai.expect(n.initials).to.be.empty;
    });
    it('should have reference to the graph', function() {
      chai.expect(n.graph).to.equal(g);
    });
    it('should know its baseDir', function() {
      chai.expect(n.baseDir).to.equal(g.baseDir);
    });
    it('should have a ComponentLoader', function() {
      chai.expect(n.loader).to.be.an('object');
    });
    it('should have transmitted the baseDir to the Component Loader', function() {
      chai.expect(n.loader.baseDir).to.equal(g.baseDir);
    });
    it('should be able to list components', function(done) {
      this.timeout(60 * 1000);
      n.loader.listComponents(function(err, components) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(components).to.be.an('object');
        done();
      });
      return;
    });
    it('should have an uptime', function() {
      chai.expect(n.uptime()).to.be.at.least(0);

    });
    describe('with new node', function() {
      it('should contain the node', function(done) {
        n.addNode({
          id: 'Graph',
          component: 'Graph',
          metadata: {
            foo: 'Bar'
          }
        }
        , done);
      });
      it('should have registered the node with the graph', function() {
        const node = g.getNode('Graph');
        chai.expect(node).to.be.an('object');
        chai.expect(node.component).to.equal('Graph');
      });
      it('should have transmitted the node metadata to the process', function() {
        chai.expect(n.processes.Graph.component.metadata).to.exist;
        chai.expect(n.processes.Graph.component.metadata).to.be.an('object');
        chai.expect(n.processes.Graph.component.metadata).to.eql(g.getNode('Graph').metadata);
      });
      it('adding the same node again should be a no-op', function(done) {
        const originalProcess = n.getNode('Graph');
        const graphNode = g.getNode('Graph');
        n.addNode(graphNode, function(err, newProcess) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(newProcess).to.equal(originalProcess);
          done();
        });
      });
      it('should not contain the node after removal', function(done) {
        n.removeNode(
          {id: 'Graph'}
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(n.processes).to.be.empty;
          done();
        });
      });
      it('should have removed the node from the graph', function() {
        const node = g.getNode('graph');
        chai.expect(node).to.be.a('null');
      });
      it('should fail when removing the removed node again', function(done) {
        n.removeNode(
          {id: 'Graph'}
        , function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('not found');
          done();
        });
      });
    });
    describe('with new edge', function() {
      before(function(done) {
        n.loader.components.Split = Split;
        n.addNode({
          id: 'A',
          component: 'Split'
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          n.addNode({
            id: 'B',
            component: 'Split'
          }
          , done);
        });
      });
      after(function(done) {
        n.removeNode(
          {id: 'A'}
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          n.removeNode(
            {id: 'B'}
          , done);
        });
      });
      it('should contain the edge', function(done) {
        n.addEdge({
          from: {
            node: 'A',
            port: 'out'
          },
          to: {
            node: 'B',
            port: 'in'
          }
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(n.connections).not.to.be.empty;
          chai.expect(n.connections[0].from).to.eql({
            process: n.getNode('A'),
            port: 'out',
            index: undefined
          });
          chai.expect(n.connections[0].to).to.eql({
            process: n.getNode('B'),
            port: 'in',
            index: undefined
          });
          done();
        });
      });
      it('should have registered the edge with the graph', function() {
        const edge = g.getEdge('A', 'out', 'B', 'in');
        chai.expect(edge).to.not.be.a('null');
      });
      it('should not contain the edge after removal', function(done) {
        n.removeEdge({
          from: {
            node: 'A',
            port: 'out'
          },
          to: {
            node: 'B',
            port: 'in'
          }
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(n.connections).to.be.empty;
          done();
        });
      });
      it('should have removed the edge from the graph', function() {
        const edge = g.getEdge('A', 'out', 'B', 'in');
        chai.expect(edge).to.be.a('null');
      });
    });
  });
  describe('with a simple graph', function() {
    let g = null;
    let n = null;
    let cb = null;
    before(function(done) {
      this.timeout(60 * 1000);
      g = new noflo.Graph;
      g.baseDir = root;
      g.addNode('Merge', 'Merge');
      g.addNode('Callback', 'Callback');
      g.addEdge('Merge', 'out', 'Callback', 'in');
      g.addInitial(function(data) {
        chai.expect(data).to.equal('Foo');
        cb();
      }
      , 'Callback', 'callback');
      g.addInitial('Foo', 'Merge', 'in');
      noflo.createNetwork(g, {
        subscribeGraph: false,
        delay: true
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Split = Split;
        nw.loader.components.Merge = Merge;
        nw.loader.components.Callback = Callback;
        n = nw;
        nw.connect(done);
      });
    });
    it('should send some initials when started', function(done) {
      chai.expect(n.initials).not.to.be.empty;
      cb = done;
      n.start(function(err) {
        if (err) {
          done(err);
          return;
        }
      });
    });
    it('should contain two processes', function() {
      chai.expect(n.processes).to.not.be.empty;
      chai.expect(n.processes.Merge).to.exist;
      chai.expect(n.processes.Merge).to.be.an('Object');
      chai.expect(n.processes.Callback).to.exist;
      chai.expect(n.processes.Callback).to.be.an('Object');
    });
    it('the ports of the processes should know the node names', function() {
      let name, port;
      for (name in n.processes.Callback.component.inPorts.ports) {
        port = n.processes.Callback.component.inPorts.ports[name];
        chai.expect(port.name).to.equal(name);
        chai.expect(port.node).to.equal('Callback');
        chai.expect(port.getId()).to.equal(`Callback ${name.toUpperCase()}`);
      }
      for (name in n.processes.Callback.component.outPorts.ports) {
        port = n.processes.Callback.component.outPorts.ports[name];
        chai.expect(port.name).to.equal(name);
        chai.expect(port.node).to.equal('Callback');
        chai.expect(port.getId()).to.equal(`Callback ${name.toUpperCase()}`);
      }

    });
    it('should contain 1 connection between processes and 2 for IIPs', function() {
      chai.expect(n.connections).to.not.be.empty;
      chai.expect(n.connections.length).to.equal(3);

    });
    it('should have started in debug mode', function() {
      chai.expect(n.debug).to.equal(true);
      chai.expect(n.getDebug()).to.equal(true);

    });
    it('should emit a process-error when a component throws', function(done) {
      n.removeInitial({
        to: {
          node: 'Callback',
          port: 'callback'
        }
      }
      , function(err) {
        if (err) {
          done(err);
          return;
        }
        n.removeInitial({
          to: {
            node: 'Merge',
            port: 'in'
          }
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          n.addInitial({
            from: {
              data(data) { throw new Error('got Foo'); }
            },
            to: {
              node: 'Callback',
              port: 'callback'
            }
          }
          , function(err) {
            if (err) {
              done(err);
              return;
            }
            n.addInitial({
              from: {
                data: 'Foo'
              },
              to: {
                node: 'Merge',
                port: 'in'
              }
            }
            , function(err) {
              if (err) {
                done(err);
                return;
              }
              n.once('process-error', function(err) {
                chai.expect(err).to.be.an('object');
                chai.expect(err.id).to.equal('Callback');
                chai.expect(err.metadata).to.be.an('object');
                chai.expect(err.error).to.be.an('error');
                chai.expect(err.error.message).to.equal('got Foo');
                done();
              });
              n.sendInitials(function(err) {
                if (err) {
                  done(err);
                  return;
                }
              });
            });
          });
        });
      });
    });
    describe('with a renamed node', function() {
      it('should have the process in a new location', function(done) {
        n.renameNode('Callback', 'Func', function(err) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(n.processes.Func).to.be.an('object');
          done();
        });
      });
      it('shouldn\'t have the process in the old location', function() {
        chai.expect(n.processes.Callback).to.be.undefined;
      });
      it('should have updated the name in the graph', function() {
        chai.expect(n.getNode('Callback')).to.not.exist;
        chai.expect(n.getNode('Func')).to.exist;
      });
      it('should fail to rename with the old name', function(done) {
        n.renameNode('Callback', 'Func', function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('not found');
          done();
        });
      });
      it('should have informed the ports of their new node name', function() {
        let name, port;
        for (name in n.processes.Func.component.inPorts.ports) {
          port = n.processes.Func.component.inPorts.ports[name];
          chai.expect(port.name).to.equal(name);
          chai.expect(port.node).to.equal('Func');
          chai.expect(port.getId()).to.equal(`Func ${name.toUpperCase()}`);
        }
        for (name in n.processes.Func.component.outPorts.ports) {
          port = n.processes.Func.component.outPorts.ports[name];
          chai.expect(port.name).to.equal(name);
          chai.expect(port.node).to.equal('Func');
          chai.expect(port.getId()).to.equal(`Func ${name.toUpperCase()}`);
        }
      });
    });
    describe('with process icon change', function() {
      it('should emit an icon event', function(done) {
        n.once('icon', function(data) {
          chai.expect(data).to.be.an('object');
          chai.expect(data.id).to.equal('Func');
          chai.expect(data.icon).to.equal('flask');
          done();
        });
        n.processes.Func.component.setIcon('flask');
      });
    });
    describe('once stopped', function() {
      it('should be marked as stopped', function(done) {
        n.stop(function() {
          chai.expect(n.isStarted()).to.equal(false);
          done();
        });
      });
    });
    describe('without the delay option', function() {
      it('should auto-start', function(done) {
        g.removeInitial('Func', 'callback');
        const newGraph = noflo.graph.loadJSON(g.toJSON(), function(err, graph) {
          if (err) {
            done(err);
            return;
          }
          // Pass the already-initialized component loader
          graph.componentLoader = n.loader;
          graph.addInitial(function(data) {
            chai.expect(data).to.equal('Foo');
            done();
          }
          , 'Func', 'callback');
          noflo.createNetwork(graph, {
            subscribeGraph: false,
            delay: false
          }
          , function(err, nw) {
            if (err) {
              done(err);
              return;
            }
          });
        });
      });
    });
  });
  describe('with nodes containing default ports', function() {
    let g = null;
    let testCallback = null;
    let c = null;
    let cb = null;

    beforeEach(function() {
      testCallback = null;
      c = null;
      cb = null;

      c = new noflo.Component;
      c.inPorts.add('in', {
        required: true,
        datatype: 'string',
        default: 'default-value'
      }
      );
      c.outPorts.add('out');
      c.process(function(input, output) {
        output.sendDone(input.get('in'));
      });
      cb = new noflo.Component;
      cb.inPorts.add('in', {
        required: true,
        datatype: 'all'
      }
      );
      cb.process(function(input, output) {
        if (!input.hasData('in')) { return; }
        testCallback(input.getData('in'));
      });
      g = new noflo.Graph;
      g.baseDir = root;
      g.addNode('Def', 'Def');
      g.addNode('Cb', 'Cb');
      g.addEdge('Def', 'out', 'Cb', 'in');

    });
    it('should send default values to nodes without an edge', function(done) {
      this.timeout(60 * 1000);
      testCallback = function(data) {
        chai.expect(data).to.equal('default-value');
        done();
      };
      noflo.createNetwork(g, {
        subscribeGraph: false,
        delay: true
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Def = () => c;
        nw.loader.components.Cb = () => cb;
        nw.connect(function(err) {
          if (err) {
            done(err);
            return;
          }
          nw.start(function(err) {
            if (err) {
              done(err);
              return;
            }
          });
        });
      });
    });
    it('should not send default values to nodes with an edge', function(done) {
      this.timeout(60 * 1000);
      testCallback = function(data) {
        chai.expect(data).to.equal('from-edge');
        done();
      };
      g.addNode('Merge', 'Merge');
      g.addEdge('Merge', 'out', 'Def', 'in');
      g.addInitial('from-edge', 'Merge', 'in');
      noflo.createNetwork(g, {
        subscribeGraph: false,
        delay: true
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Def = () => c;
        nw.loader.components.Cb = () => cb;
        nw.loader.components.Merge = Merge;
        nw.connect(function(err) {
          if (err) {
            done(err);
            return;
          }
          nw.start(function(err) {
            if (err) {
              done(err);
              return;
            }
          });
        });
      });
    });
    it('should not send default values to nodes with IIP', function(done) {
      this.timeout(60 * 1000);
      testCallback = function(data) {
        chai.expect(data).to.equal('from-IIP');
        done();
      };
      g.addInitial('from-IIP', 'Def', 'in');
      noflo.createNetwork(g, {
        subscribeGraph: false,
        delay: true
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Def = () => c;
        nw.loader.components.Cb = () => cb;
        nw.loader.components.Merge = Merge;
        nw.connect(function(err) {
          if (err) {
            done(err);
            return;
          }
          nw.start(function(err) {
            if (err) {
              done(err);
              return;
            }
          });
        });
      });
    });
  });
  describe('with an existing IIP', function() {
    let g = null;
    let n = null;
    before(function() {
      g = new noflo.Graph;
      g.baseDir = root;
      g.addNode('Callback', 'Callback');
      g.addNode('Repeat', 'Split');
      g.addEdge('Repeat', 'out', 'Callback', 'in');
    });
    it('should call the Callback with the original IIP value', function(done) {
      this.timeout(6000);
      const cb = function(packet) {
        chai.expect(packet).to.equal('Foo');
        done();
      };
      g.addInitial(cb, 'Callback', 'callback');
      g.addInitial('Foo', 'Repeat', 'in');
      setTimeout(function() {
        noflo.createNetwork(g, {
          delay: true,
          subscribeGraph: false
        }
        , function(err, nw) {
          if (err) {
            done(err);
            return;
          }
          nw.loader.components.Split = Split;
          nw.loader.components.Merge = Merge;
          nw.loader.components.Callback = Callback;
          n = nw;
          nw.connect(function(err) {
            if (err) {
              done(err);
              return;
            }
            nw.start(function(err) {
              if (err) {
                done(err);
                return;
              }
            });
          });
        });
      }
      , 10);
    });
    it('should allow removing the IIPs', function(done) {
      n.removeInitial({
        to: {
          node: 'Callback',
          port: 'callback'
        }
      }
      , function(err) {
        if (err) {
          done(err);
          return;
        }
        n.removeInitial({
          to: {
            node: 'Repeat',
            port: 'in'
          }
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(n.initials.length).to.equal(0, 'No IIPs left');
          chai.expect(n.connections.length).to.equal(1, 'Only one connection');
          done();
        });
      });
    });
    it('new IIPs to replace original ones should work correctly', function(done) {
      const cb = function(packet) {
        chai.expect(packet).to.equal('Baz');
        done();
      };
      n.addInitial({
        from: {
          data: cb
        },
        to: {
          node: 'Callback',
          port: 'callback'
        }
      }
      , function(err) {
        if (err) {
          done(err);
          return;
        }
        n.addInitial({
          from: {
            data: 'Baz'
          },
          to: {
            node: 'Repeat',
            port: 'in'
          }
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          n.start(function(err) {
            if (err) {
              done(err);
              return;
            }
          });
        });
      });
    });
    describe('on stopping', function() {
      it('processes should be running before the stop call', function() {
        chai.expect(n.started).to.be.true;
        chai.expect(n.processes.Repeat.component.started).to.equal(true);
      });
      it('should emit the end event', function(done) {
        this.timeout(5000);
        // Ensure we have a connection open
        n.once('end', function(endTimes) {
          chai.expect(endTimes).to.be.an('object');
          done();
        });
        n.stop(function(err) {
          if (err) {
            done(err);
            return;
          }
        });
      });
      it('should have called the shutdown method of each process', function() {
        chai.expect(n.processes.Repeat.component.started).to.equal(false);
      });
    });
  });
  describe('with a very large network', function() {
    it('should be able to connect without errors', function(done) {
      let n;
      this.timeout(100000);
      const g = new noflo.Graph;
      g.baseDir = root;
      let called = 0;
      for (n = 0; n <= 10000; n++) {
        g.addNode(`Repeat${n}`, 'Split');
      }
      g.addNode('Callback', 'Callback');
      for (n = 0; n <= 10000; n++) {
        g.addEdge(`Repeat${n}`, 'out', 'Callback', 'in');
      }
      g.addInitial(function() {
        called++;
      }
      , 'Callback', 'callback');
      for (n = 0; n <= 10000; n++) {
        g.addInitial(n, `Repeat${n}`, 'in');
      }

      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader.components.Split = Split;
        nw.loader.components.Callback = Callback;
        nw.once('end', function() {
          chai.expect(called).to.equal(10001);
          done();
        });
        nw.connect(function(err) {
          if (err) {
            done(err);
            return;
          }
          nw.start(function(err) {
            if (err) {
              done(err);
              return;
            }
          });
        });
      });
    });
  });
  describe('with a faulty graph', function() {
    let loader = null;
    before(function(done) {
      loader = new noflo.ComponentLoader(root);
      loader.listComponents(function(err) {
        if (err) {
          done(err);
          return;
        }
        loader.components.Split = Split;
        done();
      });
    });
    it('should fail on connect with non-existing component', function(done) {
      const g = new noflo.Graph;
      g.addNode('Repeat1', 'Baz');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect(function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('not available');
          done();
        });
      });
    });
    it('should fail on connect with missing target port', function(done) {
      const g = new noflo.Graph;
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'foo');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect(function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('No inport');
          done();
        });
      });
    });
    it('should fail on connect with missing source port', function(done) {
      const g = new noflo.Graph;
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'foo', 'Repeat2', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect(function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('No outport');
          done();
        });
      });
    });
    it('should fail on connect with missing IIP target port', function(done) {
      const g = new noflo.Graph;
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2', 'Split');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      g.addInitial('hello', 'Repeat1', 'baz');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect(function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('No inport');
          done();
        });
      });
    });
    it('should fail on connect with node without component', function(done) {
      const g = new noflo.Graph;
      g.addNode('Repeat1', 'Split');
      g.addNode('Repeat2');
      g.addEdge('Repeat1', 'out', 'Repeat2', 'in');
      g.addInitial('hello', 'Repeat1', 'in');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect(function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('No component defined');
          done();
        });
      });
    });
    it('should fail to add an edge to a missing outbound node', function(done) {
      const g = new noflo.Graph;
      g.addNode('Repeat1', 'Split');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect(function(err) {
          if (err) {
            done(err);
            return;
          }
          nw.addEdge({
            from: {
              node: 'Repeat2',
              port: 'out'
            },
            to: {
              node: 'Repeat1',
              port: 'in'
            }
          }, function(err) {
            chai.expect(err).to.be.an('error');
            chai.expect(err.message).to.contain('No process defined for outbound node');
            done();
          });
        });
      });
    });
    it('should fail to add an edge to a missing inbound node', function(done) {
      const g = new noflo.Graph;
      g.addNode('Repeat1', 'Split');
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        nw.loader = loader;
        nw.connect(function(err) {
          if (err) {
            done(err);
            return;
          }
          nw.addEdge({
            from: {
              node: 'Repeat1',
              port: 'out'
            },
            to: {
              node: 'Repeat2',
              port: 'in'
            }
          }, function(err) {
            chai.expect(err).to.be.an('error');
            chai.expect(err.message).to.contain('No process defined for inbound node');
            done();
          });
        });
      });
    });
  });
  describe('baseDir setting', function() {
    it('should set baseDir based on given graph', function(done) {
      const g = new noflo.Graph;
      g.baseDir = root;
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(nw.baseDir).to.equal(root);
        done();
      });
    });
    it('should fall back to CWD if graph has no baseDir', function(done) {
      if (noflo.isBrowser()) {
        this.skip();
        return;
      }
      const g = new noflo.Graph;
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(nw.baseDir).to.equal(process.cwd());
        done();
      });
    });
    it('should set the baseDir for the component loader', function(done) {
      const g = new noflo.Graph;
      g.baseDir = root;
      noflo.createNetwork(g, {
        delay: true,
        subscribeGraph: false
      }
      , function(err, nw) {
        if (err) {
          done(err);
          return;
        }
        chai.expect(nw.baseDir).to.equal(root);
        chai.expect(nw.loader.baseDir).to.equal(root);
        done();
      });
    });
  });
  describe('debug setting', function() {
    let n = null;
    let g = null;
    before(function(done) {
      g = new noflo.Graph;
      g.baseDir = root;
      noflo.createNetwork(g, {
        subscribeGraph: false,
        default: true
      }
      , function(err, network) {
        if (err) {
          done(err);
          return;
        }
        n = network;
        n.loader.components.Split = Split;
        n.addNode({
          id: 'A',
          component: 'Split'
        }
        , function(err) {
          if (err) {
            done(err);
            return;
          }
          n.addNode({
            id: 'B',
            component: 'Split'
          }
          , function(err) {
            if (err) {
              done(err);
              return;
            }
            n.addEdge({
              from: {
                node: 'A',
                port: 'out'
              },
              to: {
                node: 'B',
                port: 'in'
              }
            }
            , function(err) {
              if (err) {
                done(err);
                return;
              }
              n.connect(done);
            });
          });
        });
      });
    });
    it('should initially have debug enabled', function() {
      chai.expect(n.getDebug()).to.equal(true);
    });
    it('should have propagated debug setting to connections', function() {
      chai.expect(n.connections[0].debug).to.equal(n.getDebug());
    });
    it('calling setDebug with same value should be no-op', function() {
      n.setDebug(true);
      chai.expect(n.getDebug()).to.equal(true);
      chai.expect(n.connections[0].debug).to.equal(n.getDebug());
    });
    it('disabling debug should get propagated to connections', function() {
      n.setDebug(false);
      chai.expect(n.getDebug()).to.equal(false);
      chai.expect(n.connections[0].debug).to.equal(n.getDebug());
    });
  });
});
