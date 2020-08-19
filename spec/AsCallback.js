describe('asCallback interface', () => {
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

  before((done) => {
    loader = new noflo.ComponentLoader(baseDir);
    loader.listComponents((err) => {
      if (err) {
        done(err);
        return;
      }
      loader.registerComponent('process', 'Async', processAsync);
      loader.registerComponent('process', 'Error', processError);
      loader.registerComponent('process', 'Values', processValues);
      loader.registerComponent('process', 'NeverSend', neverSend);
      loader.registerComponent('process', 'Streamify', streamify);
      done();
    });
  });
  describe('with a non-existing component', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asCallback('foo/Bar',
        { loader });
    });
    it('should be able to wrap it', (done) => {
      chai.expect(wrapped).to.be.a('function');
      chai.expect(wrapped.length).to.equal(2);
      done();
    });
    it('should fail execution', (done) => {
      wrapped(1, (err) => {
        chai.expect(err).to.be.an('error');
        done();
      });
    });
  });
  describe('with simple asynchronous component', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asCallback('process/Async',
        { loader });
    });
    it('should be able to wrap it', (done) => {
      chai.expect(wrapped).to.be.a('function');
      chai.expect(wrapped.length).to.equal(2);
      done();
    });
    it('should execute network with input map and provide output map', (done) => {
      const expected = { hello: 'world' };

      wrapped(
        { in: expected },
        (err, out) => {
          if (err) {
            done(err);
            return;
          }
          chai.expect(out.out).to.eql(expected);
          done();
        },
      );
    });
    it('should execute network with simple input and provide simple output', (done) => {
      const expected = { hello: 'world' };

      wrapped(expected, (err, out) => {
        if (err) {
          done(err);
          return;
        }
        chai.expect(out).to.eql(expected);
        done();
      });
    });
    it('should not mix up simultaneous runs', (done) => {
      let received = 0;
      for (let idx = 0; idx <= 100; idx += 1) {
        /* eslint-disable no-loop-func */
        wrapped(idx, (err, out) => {
          if (err) {
            done(err);
            return;
          }
          chai.expect(out).to.equal(idx);
          received++;
          if (received !== 101) { return; }
          done();
        });
      }
    });
    it('should execute a network with a sequence and provide output sequence', (done) => {
      const sent = [
        { in: 'hello' },
        { in: 'world' },
        { in: 'foo' },
        { in: 'bar' },
      ];
      const expected = sent.map((portmap) => ({ out: portmap.in }));
      wrapped(sent, (err, out) => {
        if (err) {
          done(err);
          return;
        }
        chai.expect(out).to.eql(expected);
        done();
      });
    });
    describe('with the raw option', () => {
      it('should execute a network with a sequence and provide output sequence', (done) => {
        const wrappedRaw = noflo.asCallback('process/Async', {
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
        wrappedRaw(sent, (err, out) => {
          if (err) {
            done(err);
            return;
          }
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
          done();
        });
      });
    });
  });
  describe('with a component sending an error', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asCallback('process/Error',
        { loader });
    });
    it('should execute network with input map and provide error', (done) => {
      const expected = 'hello there';
      wrapped(
        { in: expected },
        (err) => {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain(expected);
          done();
        },
      );
    });
    it('should execute network with simple input and provide error', (done) => {
      const expected = 'hello world';
      wrapped(expected, (err) => {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain(expected);
        done();
      });
    });
  });
  describe('with a component supporting only certain values', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asCallback('process/Values',
        { loader });
    });
    it('should execute network with input map and provide output map', (done) => {
      const expected = 'blue';
      wrapped(
        { in: expected },
        (err, out) => {
          if (err) {
            done(err);
            return;
          }
          chai.expect(out.out).to.eql(expected);
          done();
        },
      );
    });
    it('should execute network with simple input and provide simple output', (done) => {
      const expected = 'blue';
      wrapped(expected, (err, out) => {
        if (err) {
          done(err);
          return;
        }
        chai.expect(out).to.eql(expected);
        done();
      });
    });
    it('should execute network with wrong map and provide error', (done) => {
      wrapped(
        { in: 'red' },
        (err) => {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
          done();
        },
      );
    });
    it('should execute network with wrong input and provide error', (done) => {
      wrapped('red', (err) => {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
        done();
      });
    });
  });
  describe('with a component sending streams', () => {
    let wrapped = null;
    before(() => {
      wrapped = noflo.asCallback('process/Streamify',
        { loader });
    });
    it('should execute network with input map and provide output map with streams as arrays', (done) => {
      wrapped(
        { in: 'hello world' },
        (err, out) => {
          chai.expect(out.out).to.eql([
            ['h', 'e', 'l', 'l', 'o'],
            ['w', 'o', 'r', 'l', 'd'],
          ]);
          done();
        },
      );
    });
    it('should execute network with simple input and and provide simple output with streams as arrays', (done) => {
      wrapped('hello there', (err, out) => {
        chai.expect(out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['t', 'h', 'e', 'r', 'e'],
        ]);
        done();
      });
    });
    describe('with the raw option', () => {
      it('should execute network with input map and provide output map with IP objects', (done) => {
        const wrappedRaw = noflo.asCallback('process/Streamify', {
          loader,
          raw: true,
        });
        wrappedRaw(
          { in: 'hello world' },
          (err, out) => {
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
            done();
          },
        );
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
        wrapped = noflo.asCallback(graph,
          { loader });
        done();
      });
    });
    it('should execute network with input map and provide output map with streams as arrays', (done) => {
      wrapped(
        { in: 'hello world' },
        (err, out) => {
          if (err) {
            done(err);
            return;
          }
          chai.expect(out.out).to.eql([
            ['h', 'e', 'l', 'l', 'o'],
            ['w', 'o', 'r', 'l', 'd'],
          ]);
          done();
        },
      );
    });
    it('should execute network with simple input and and provide simple output with streams as arrays', (done) => {
      wrapped('hello there', (err, out) => {
        if (err) {
          done(err);
          return;
        }
        chai.expect(out).to.eql([
          ['h', 'e', 'l', 'l', 'o'],
          ['t', 'h', 'e', 'r', 'e'],
        ]);
        done();
      });
    });
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
        wrapped = noflo.asCallback(graph,
          { loader });
        done();
      });
    });
    it('should execute network with input map and provide output map', (done) => {
      const expected = 'blue';
      wrapped(
        { in: expected },
        (err, out) => {
          if (err) {
            done(err);
            return;
          }
          chai.expect(out.out).to.eql(expected);
          done();
        },
      );
    });
    it('should execute network with simple input and provide simple output', (done) => {
      const expected = 'blue';
      wrapped(expected, (err, out) => {
        if (err) {
          done(err);
          return;
        }
        chai.expect(out).to.eql(expected);
        done();
      });
    });
    it('should execute network with wrong map and provide error', (done) => {
      wrapped(
        { in: 'red' },
        (err) => {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
          done();
        },
      );
    });
    it('should execute network with wrong input and provide error', (done) => {
      wrapped('red', (err) => {
        chai.expect(err).to.be.an('error');
        chai.expect(err.message).to.contain('Invalid data=\'red\' received, not in [green,blue]');
        done();
      });
    });
  });
});
