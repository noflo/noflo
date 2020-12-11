describe('asPromise interface', () => {
  let loader = null;

  const processAsync = function () {
    const c = new noflo.Component();
    c.inPorts.add('in',
      { datatype: 'string' });
    c.outPorts.add('out',
      { datatype: 'string' });

    return c.process((input, output) => {
      const data = input.getData('in');
      setTimeout(() => output.sendDone(data),
        1);
    });
  };
  const processError = function () {
    const c = new noflo.Component();
    c.inPorts.add('in',
      { datatype: 'string' });
    c.outPorts.add('out',
      { datatype: 'string' });
    c.outPorts.add('error');
    return c.process((input, output) => {
      const data = input.getData('in');
      output.done(new Error(`Received ${data}`));
    });
  };
  const processValues = function () {
    const c = new noflo.Component();
    c.inPorts.add('in', {
      datatype: 'string',
      values: ['green', 'blue'],
    });
    c.outPorts.add('out',
      { datatype: 'string' });
    return c.process((input, output) => {
      const data = input.getData('in');
      output.sendDone(data);
    });
  };
  const neverSend = function () {
    const c = new noflo.Component();
    c.inPorts.add('in',
      { datatype: 'string' });
    c.outPorts.add('out',
      { datatype: 'string' });
    return c.process((input) => {
      input.getData('in');
    });
  };
  const streamify = function () {
    const c = new noflo.Component();
    c.inPorts.add('in',
      { datatype: 'string' });
    c.outPorts.add('out',
      { datatype: 'string' });
    c.process((input, output) => {
      const data = input.getData('in');
      const words = data.split(' ');
      for (let idx = 0; idx < words.length; idx++) {
        const word = words[idx];
        output.send(new noflo.IP('openBracket', idx));
        const chars = word.split('');
        for (const char of chars) { output.send(new noflo.IP('data', char)); }
        output.send(new noflo.IP('closeBracket', idx));
      }
      output.done();
    });
    return c;
  };

  before(() => {
    loader = new noflo.ComponentLoader(baseDir);
    return loader
      .listComponents()
      .then(() => {
        loader.registerComponent('process', 'Async', processAsync);
        loader.registerComponent('process', 'Error', processError);
        loader.registerComponent('process', 'Values', processValues);
        loader.registerComponent('process', 'NeverSend', neverSend);
        loader.registerComponent('process', 'Streamify', streamify);
      });
  });
  describe('with a non-existing component', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asPromise('foo/Bar',
        { loader });
    });
    it('should be able to wrap it', (done) => {
      chai.expect(wrapped).to.be.a('function');
      chai.expect(wrapped.length).to.equal(1);
      done();
    });
    it('should fail execution', () => wrapped(1)
      .then(() => {
        throw new Error('Unexpected pass');
      }, (err) => {
        chai.expect(err).to.be.an('error');
      }));
  });
  describe('with simple asynchronous component', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asPromise('process/Async',
        { loader });
    });
    it('should be able to wrap it', (done) => {
      chai.expect(wrapped).to.be.a('function');
      chai.expect(wrapped.length).to.equal(1);
      done();
    });
    it('should execute network with input map and provide output map', () => {
      const expected = { hello: 'world' };

      return wrapped({
        in: expected,
      })
        .then((out) => {
          chai.expect(out.out).to.eql(expected);
        });
    });
    it('should execute network with simple input and provide simple output', () => {
      const expected = { hello: 'world' };

      return wrapped(expected)
        .then((out) => {
          chai.expect(out).to.eql(expected);
        });
    });
    it('should not mix up simultaneous runs', (done) => {
      let received = 0;
      for (let idx = 0; idx <= 100; idx += 1) {
        /* eslint-disable no-loop-func */
        wrapped(idx)
          .then((out) => {
            chai.expect(out).to.equal(idx);
            received++;
            if (received !== 101) { return; }
            done();
          }, done);
      }
    });
    it('should execute a network with a sequence and provide output sequence', () => {
      const sent = [
        { in: 'hello' },
        { in: 'world' },
        { in: 'foo' },
        { in: 'bar' },
      ];
      const expected = sent.map((portmap) => ({ out: portmap.in }));
      return wrapped(sent)
        .then((out) => {
          chai.expect(out).to.eql(expected);
        });
    });
    describe('with the raw option', () => {
      it('should execute a network with a sequence and provide output sequence', () => {
        const wrappedRaw = noflo.asPromise('process/Async', {
          loader,
          raw: true,
        });
        const sent = [
          { in: new noflo.IP('openBracket', 'a') },
          { in: 'hello' },
          { in: 'world' },
          { in: new noflo.IP('closeBracket', 'a') },
          { in: new noflo.IP('openBracket', 'b') },
          { in: 'foo' },
          { in: 'bar' },
          { in: new noflo.IP('closeBracket', 'b') },
        ];
        return wrappedRaw(sent)
          .then((out) => {
            const types = out.map((map) => `${map.out.type} ${map.out.data}`);
            chai.expect(types).to.eql([
              'openBracket a',
              'data hello',
              'data world',
              'closeBracket a',
              'openBracket b',
              'data foo',
              'data bar',
              'closeBracket b',
            ]);
          });
      });
    });
  });
  describe('with a component sending an error', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asPromise('process/Error',
        { loader });
    });
    it('should execute network with input map and provide error', () => {
      const expected = 'hello there';
      return wrapped({
        in: expected,
      })
        .then(() => {
          throw new Error('Received unexpected output');
        }, (err) => {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain(expected);
        });
    });
    it('should execute network with simple input and provide error', () => {
      const expected = 'hello world';
      return wrapped(expected)
        .then(() => {
          throw new Error('Received unexpected output');
        }, (err) => {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain(expected);
        });
    });
  });
  describe('with a component supporting only certain values', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asPromise('process/Values',
        { loader });
    });
    it('should execute network with input map and provide output map', () => {
      const expected = 'blue';
      return wrapped({
        in: expected,
      })
        .then((out) => {
          chai.expect(out.out).to.eql(expected);
        });
    });
    it('should execute network with simple input and provide simple output', () => {
      const expected = 'blue';
      return wrapped(expected)
        .then((out) => {
          chai.expect(out).to.eql(expected);
        });
    });
    it('should execute network with wrong map and provide error', () => wrapped({
      in: 'red',
    })
      .then(() => {
        throw new Error('Received unexpected output');
      }, (err) => {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
      }));
    it('should execute network with wrong input and provide error', () => wrapped('red')
      .then(() => {
        throw new Error('Received unexpected output');
      }, (err) => {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
      }));
  });
  describe('with a component sending streams', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asPromise('process/Streamify',
        { loader });
    });
    it('should execute network with input map and provide output map with streams as arrays', () => wrapped({
      in: 'hello world',
    })
      .then((out) => {
        chai.expect(out.out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['w', 'o', 'r', 'l', 'd'],
        ]);
      }));
    it('should execute network with simple input and and provide simple output with streams as arrays', () => wrapped('hello there')
      .then((out) => {
        chai.expect(out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['t', 'h', 'e', 'r', 'e'],
        ]);
      }));
    describe('with the raw option', () => {
      it('should execute network with input map and provide output map with IP objects', () => {
        const wrappedRaw = noflo.asPromise('process/Streamify', {
          loader,
          raw: true,
        });
        return wrappedRaw({
          in: 'hello world',
        })
          .then((out) => {
            const types = out.out.map((ip) => `${ip.type} ${ip.data}`);
            chai.expect(types).to.eql([
              'openBracket 0',
              'data h',
              'data e',
              'data l',
              'data l',
              'data o',
              'closeBracket 0',
              'openBracket 1',
              'data w',
              'data o',
              'data r',
              'data l',
              'data d',
              'closeBracket 1',
            ]);
          });
      });
    });
  });
  describe('with a graph instead of component name', () => {
    let graph = null;
    let wrapped = null;
    before((done) => {
      noflo.graph.loadFBP(`\
INPORT=Async.IN:IN
OUTPORT=Stream.OUT:OUT
Async(process/Async) OUT -> IN Stream(process/Streamify)\
`, (err, g) => {
        if (err) {
          done(err);
          return;
        }
        graph = g;
        wrapped = noflo.asPromise(graph, {
          loader,
          asyncDelivery: true,
        });
        done();
      });
    });
    it('should execute network with input map and provide output map with streams as arrays', () => wrapped({
      in: 'hello world',
    })
      .then((out) => {
        chai.expect(out.out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['w', 'o', 'r', 'l', 'd'],
        ]);
      }));
    it('should execute network with simple input and and provide simple output with streams as arrays', () => wrapped('hello there')
      .then((out) => {
        chai.expect(out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['t', 'h', 'e', 'r', 'e'],
        ]);
      }));
  });
  describe('with a graph instead of component name (synchronous)', () => {
    let graph = null;
    let wrapped = null;
    before((done) => {
      noflo.graph.loadFBP(`\
INPORT=Async.IN:IN
OUTPORT=Stream.OUT:OUT
Async(process/Async) OUT -> IN Stream(process/Streamify)\
`, (err, g) => {
        if (err) {
          done(err);
          return;
        }
        graph = g;
        wrapped = noflo.asPromise(graph,
          { loader });
        done();
      });
    });
    it('should execute network with input map and provide output map with streams as arrays', () => wrapped({
      in: 'hello world',
    })
      .then((out) => {
        chai.expect(out.out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['w', 'o', 'r', 'l', 'd'],
        ]);
      }));
    it('should execute network with simple input and and provide simple output with streams as arrays', () => wrapped('hello there')
      .then((out) => {
        chai.expect(out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['t', 'h', 'e', 'r', 'e'],
        ]);
      }));
  });
  describe('with a graph containing a component supporting only certain values', () => {
    let graph = null;
    let wrapped = null;
    before((done) => {
      noflo.graph.loadFBP(`\
INPORT=Async.IN:IN
OUTPORT=Values.OUT:OUT
Async(process/Async) OUT -> IN Values(process/Values)\
`, (err, g) => {
        if (err) {
          done(err);
          return;
        }
        graph = g;
        wrapped = noflo.asPromise(graph,
          { loader });
        done();
      });
    });
    it('should execute network with input map and provide output map', () => {
      const expected = 'blue';
      return wrapped({
        in: expected,
      })
        .then((out) => {
          chai.expect(out.out).to.eql(expected);
        });
    });
    it('should execute network with simple input and provide simple output', () => {
      const expected = 'blue';
      return wrapped(expected)
        .then((out) => {
          chai.expect(out).to.eql(expected);
        });
    });
    it('should execute network with wrong map and provide error', () => wrapped({
      in: 'red',
    })
      .then(() => {
        throw new Error('Unexpected pass');
      }, (err) => {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
      }));
    it('should execute network with wrong input and provide error', () => wrapped('red')
      .then(() => {
        throw new Error('Unexpected pass');
      }, (err) => {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
      }));
  });
  describe('with networkCallback option', () => {
    let wrapped = null;
    let called = 0;
    let started = 0;
    afterEach(() => {
      called = 0;
      started = 0;
    });
    it('should not provide network at callbackization time', (done) => {
      chai.expect(called).to.equal(0);
      wrapped = noflo.asPromise('process/Async', {
        loader,
        networkCallback: (network) => {
          network.on('start', () => {
            started++;
          });
          called++;
        },
      });
      chai.expect(wrapped).to.be.a('function');
      chai.expect(called).to.equal(0);
      done();
    });
    it('should provide the network to the callback when executed', () => {
      const expected = { hello: 'world' };
      chai.expect(called).to.equal(0);

      return wrapped(expected)
        .then((out) => {
          chai.expect(out).to.eql(expected);
          chai.expect(called).to.equal(1);
        });
    });
    it('should provide the network before actual execution so that we catch the start event', () => {
      const expected = { hello: 'world' };
      chai.expect(called).to.equal(0);
      chai.expect(started).to.equal(0);

      return wrapped(expected)
        .then((out) => {
          chai.expect(out).to.eql(expected);
          chai.expect(called).to.equal(1);
          chai.expect(started).to.equal(1);
        });
    });
  });
  describe('with flowtrace option', () => {
    it('should store a trace for a simple component execution', () => {
      const trace = new flowtrace.Flowtrace();
      const wrapped = noflo.asPromise('process/Async', {
        loader,
        flowtrace: trace,
      });
      return wrapped('hello')
        .then((out) => {
          chai.expect(out).to.equal('hello');
          const collectedTrace = trace.toJSON();
          chai.expect(collectedTrace.header.metadata).to.include.keys(['start', 'end']);
          chai.expect(collectedTrace.header.graphs['process/Async']).to.be.an('object');
          chai.expect(collectedTrace.header.main).to.equal('process/Async');
          const eventTypes = collectedTrace.events.map((e) => `${e.protocol}:${e.command}`);
          chai.expect(eventTypes).to.eql([
            'network:started',
            'network:data',
            'network:data',
            'network:stopped',
          ]);
          chai.expect(JSON.parse(JSON.stringify(collectedTrace.events[1].payload))).to.eql({
            data: 'hello',
            src: null,
            tgt: {
              node: 'process/Async',
              port: 'in',
            },
          });
          chai.expect(JSON.parse(JSON.stringify(collectedTrace.events[2].payload))).to.eql({
            data: 'hello',
            src: {
              node: 'process/Async',
              port: 'out',
            },
            tgt: null,
          });
        });
    });
  });
});
