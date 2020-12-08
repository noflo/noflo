const legacyBasic = function () {
  const c = new noflo.Component();
  c.inPorts.add('in',
    { datatype: 'string' });
  c.outPorts.add('out',
    { datatype: 'string' });
  c.inPorts.in.on('connect', () => {
    c.outPorts.out.connect();
  });
  c.inPorts.in.on('begingroup', (group) => {
    c.outPorts.out.beginGroup(group);
  });
  c.inPorts.in.on('data', (data) => {
    c.outPorts.out.data(data + c.nodeId);
  });
  c.inPorts.in.on('endgroup', () => {
    c.outPorts.out.endGroup();
  });
  c.inPorts.in.on('disconnect', () => {
    c.outPorts.out.disconnect();
  });
  return c;
};

const processAsync = function () {
  const c = new noflo.Component();
  c.inPorts.add('in',
    { datatype: 'string' });
  c.outPorts.add('out',
    { datatype: 'string' });

  c.process((input, output) => {
    const data = input.getData('in');
    setTimeout(() => {
      output.sendDone(data + c.nodeId);
    },
    1);
  });
  return c;
};

const processMerge = function () {
  const c = new noflo.Component();
  c.inPorts.add('in1',
    { datatype: 'string' });
  c.inPorts.add('in2',
    { datatype: 'string' });
  c.outPorts.add('out',
    { datatype: 'string' });

  c.forwardBrackets = { in1: ['out'] };

  c.process((input, output) => {
    if (!input.has('in1', 'in2', (ip) => ip.type === 'data')) { return; }
    const first = input.getData('in1');
    const second = input.getData('in2');

    output.sendDone({ out: `1${first}:2${second}:${c.nodeId}` });
  });
  return c;
};

const processSync = function () {
  const c = new noflo.Component();
  c.inPorts.add('in',
    { datatype: 'string' });
  c.outPorts.add('out',
    { datatype: 'string' });
  c.process((input, output) => {
    const data = input.getData('in');
    output.send({ out: data + c.nodeId });
    output.done();
  });
  return c;
};

const processBracketize = function () {
  const c = new noflo.Component();
  c.inPorts.add('in',
    { datatype: 'string' });
  c.outPorts.add('out',
    { datatype: 'string' });
  c.counter = 0;
  c.tearDown = function (callback) {
    c.counter = 0;
    callback();
  };
  c.process((input, output) => {
    const data = input.getData('in');
    output.send({ out: new noflo.IP('openBracket', c.counter) });
    output.send({ out: data });
    output.send({ out: new noflo.IP('closeBracket', c.counter) });
    c.counter++;
    output.done();
  });
  return c;
};

const processNonSending = function () {
  const c = new noflo.Component();
  c.inPorts.add('in',
    { datatype: 'string' });
  c.inPorts.add('in2',
    { datatype: 'string' });
  c.outPorts.add('out',
    { datatype: 'string' });
  c.forwardBrackets = {};
  c.process((input, output) => {
    if (input.hasData('in2')) {
      input.getData('in2');
      output.done();
      return;
    }
    if (!input.hasData('in')) { return; }
    const data = input.getData('in');
    output.send(data + c.nodeId);
    output.done();
  });
  return c;
};

const processGenerator = function () {
  const c = new noflo.Component();
  c.inPorts.add('start',
    { datatype: 'bang' });
  c.inPorts.add('stop',
    { datatype: 'bang' });
  c.outPorts.add('out',
    { datatype: 'bang' });
  c.autoOrdering = false;

  const cleanUp = function () {
    if (!c.timer) { return; }
    clearInterval(c.timer.interval);
    c.timer.deactivate();
    c.timer = null;
  };
  c.tearDown = function (callback) {
    cleanUp();
    callback();
  };

  c.process((input, output, context) => {
    if (input.hasData('start')) {
      if (c.timer) { cleanUp(); }
      input.getData('start');
      c.timer = context;
      c.timer.interval = setInterval(() => {
        output.send({ out: true });
      },
      100);
    }
    if (input.hasData('stop')) {
      input.getData('stop');
      if (!c.timer) {
        output.done();
        return;
      }
      cleanUp();
      output.done();
    }
  });
  return c;
};

describe('Network Lifecycle', () => {
  const loader = new noflo.ComponentLoader(baseDir);
  before(() => loader.listComponents()
    .then(() => {
      loader.registerComponent('process', 'Async', processAsync);
      loader.registerComponent('process', 'Sync', processSync);
      loader.registerComponent('process', 'Merge', processMerge);
      loader.registerComponent('process', 'Bracketize', processBracketize);
      loader.registerComponent('process', 'NonSending', processNonSending);
      loader.registerComponent('process', 'Generator', processGenerator);
      loader.registerComponent('legacy', 'Sync', legacyBasic);
    }));
  describe('recognizing API level', () => {
    it('should recognize legacy component as such', () => loader
      .load('legacy/Sync')
      .then((inst) => {
        chai.expect(inst.isLegacy()).to.equal(true);
      }));
    it('should recognize Process API component as non-legacy', () => loader
      .load('process/Async')
      .then((inst) => {
        chai.expect(inst.isLegacy()).to.equal(false);
      }));
    it('should recognize Graph component as non-legacy', () => loader
      .load('Graph')
      .then((inst) => {
        chai.expect(inst.isLegacy()).to.equal(false);
      }));
  });
  describe('with single Process API component receiving IIP', () => {
    let c = null;
    let out = null;
    beforeEach(() => {
      const fbpData = 'OUTPORT=Pc.OUT:OUT\n'
                    + '\'hello\' -> IN Pc(process/Async)\n';
      return noflo.graph.loadFBP(fbpData)
        .then((graph) => {
          loader.registerComponent('scope', 'Connected', graph);
          return loader.load('scope/Connected');
        })
        .then((instance) => {
          c = instance;
          out = noflo.internalSocket.createSocket();
          c.outPorts.out.attach(out);
        });
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it('should execute and finish', (done) => {
      const expected = [
        'DATA helloPc',
      ];
      const received = [];
      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`< ${ip.data}`);
            break;
          case 'data':
            received.push(`DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push('>');
            break;
        }
      });
      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(received).to.eql(expected);
        chai.expect(wasStarted).to.equal(true);
        done();
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);
      c.start().catch(done);
    });
    it('should execute twice if IIP changes', (done) => {
      const expected = [
        'DATA helloPc',
        'DATA worldPc',
      ];
      const received = [];
      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`< ${ip.data}`);
            break;
          case 'data':
            received.push(`DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push('>');
            break;
        }
      });
      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(wasStarted).to.equal(true);
        if (received.length < expected.length) {
          wasStarted = false;
          c.network.once('start', checkStart);
          c.network.once('end', checkEnd);
          c.network.addInitial({
            from: {
              data: 'world',
            },
            to: {
              node: 'Pc',
              port: 'in',
            },
          },
          (err) => {
            if (err) {
              done(err);
            }
          });
          return;
        }
        chai.expect(received).to.eql(expected);
        done();
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);
      c.start().catch(done);
    });
    it('should not send new IIP if network was stopped', (done) => {
      const expected = [
        'DATA helloPc',
      ];
      const received = [];
      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`< ${ip.data}`);
            break;
          case 'data':
            received.push(`DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push('>');
            break;
        }
      });
      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(wasStarted).to.equal(true);
        c.network.stop()
          .then(() => {
            chai.expect(c.network.isStopped()).to.equal(true);
            c.network.once('start', () => {
              throw new Error('Unexpected network start');
            });
            c.network.once('end', () => {
              throw new Error('Unexpected network end');
            });
            c.network.addInitial({
              from: {
                data: 'world',
              },
              to: {
                node: 'Pc',
                port: 'in',
              },
            }, (err) => {
              if (err) {
                done(err);
              }
            });
            setTimeout(() => {
              chai.expect(received).to.eql(expected);
              done();
            }, 1000);
          }, done);
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);
      c.start().catch(done);
    });
  });
  describe('with synchronous Process API', () => {
    let c = null;
    let out = null;
    beforeEach(() => {
      const fbpData = 'OUTPORT=Sync.OUT:OUT\n'
                    + '\'foo\' -> IN2 NonSending(process/NonSending)\n'
                    + '\'hello\' -> IN Bracketize(process/Bracketize)\n'
                    + 'Bracketize OUT -> IN NonSending(process/NonSending)\n'
                    + 'NonSending OUT -> IN Sync(process/Sync)\n'
                    + 'Sync OUT -> IN2 NonSending\n';
      return noflo.graph.loadFBP(fbpData)
        .then((graph) => {
          loader.registerComponent('scope', 'Connected', graph);
          return loader.load('scope/Connected');
        })
        .then((instance) => {
          c = instance;
          out = noflo.internalSocket.createSocket();
          c.outPorts.out.attach(out);
        });
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it('should execute and finish', (done) => {
      const expected = [
        'DATA helloNonSendingSync',
      ];
      const received = [];
      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`< ${ip.data}`);
            break;
          case 'data':
            received.push(`DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push('>');
            break;
        }
      });
      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        setTimeout(() => {
          chai.expect(received).to.eql(expected);
          chai.expect(wasStarted).to.equal(true);
          done();
        },
        100);
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);
      c.start().catch(done);
    });
  });
  describe('pure Process API merging two inputs', () => {
    let c = null;
    let in1 = null;
    let in2 = null;
    let out = null;
    before(() => {
      const fbpData = 'INPORT=Pc1.IN:IN1\n'
                    + 'INPORT=Pc2.IN:IN2\n'
                    + 'OUTPORT=PcMerge.OUT:OUT\n'
                    + 'Pc1(process/Async) OUT -> IN1 PcMerge(process/Merge)\n'
                    + 'Pc2(process/Async) OUT -> IN2 PcMerge(process/Merge)\n';
      return noflo.graph.loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'Merge', g);
          return loader.load('scope/Merge');
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          in2 = noflo.internalSocket.createSocket();
          c.inPorts.in2.attach(in2);
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it('should forward new-style brackets as expected', (done) => {
      const expected = [
        'CONN',
        '< 1',
        '< a',
        'DATA 1bazPc1:2fooPc2:PcMerge',
        '>',
        '>',
        'DISC',
      ];
      const received = [];

      out.on('connect', () => {
        received.push('CONN');
      });
      out.on('begingroup', (group) => {
        received.push(`< ${group}`);
      });
      out.on('data', (data) => {
        received.push(`DATA ${data}`);
      });
      out.on('endgroup', () => {
        received.push('>');
      });
      out.on('disconnect', () => {
        received.push('DISC');
      });

      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(received).to.eql(expected);
        chai.expect(wasStarted).to.equal(true);
        done();
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);

      c.start()
        .then(() => {
          in2.connect();
          in2.send('foo');
          in2.disconnect();
          in1.connect();
          in1.beginGroup(1);
          in1.beginGroup('a');
          in1.send('baz');
          in1.endGroup();
          in1.endGroup();
          in1.disconnect();
        }, done);
    });
    it('should forward new-style brackets as expected regardless of sending order', (done) => {
      const expected = [
        'CONN',
        '< 1',
        '< a',
        'DATA 1bazPc1:2fooPc2:PcMerge',
        '>',
        '>',
        'DISC',
      ];
      const received = [];

      out.on('connect', () => {
        received.push('CONN');
      });
      out.on('begingroup', (group) => {
        received.push(`< ${group}`);
      });
      out.on('data', (data) => {
        received.push(`DATA ${data}`);
      });
      out.on('endgroup', () => {
        received.push('>');
      });
      out.on('disconnect', () => {
        received.push('DISC');
      });

      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(received).to.eql(expected);
        chai.expect(wasStarted).to.equal(true);
        done();
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);

      c.start()
        .then(() => {
          in1.connect();
          in1.beginGroup(1);
          in1.beginGroup('a');
          in1.send('baz');
          in1.endGroup();
          in1.endGroup();
          in1.disconnect();
          in2.connect();
          in2.send('foo');
          in2.disconnect();
        }, done);
    });
    it('should forward scopes as expected', (done) => {
      const expected = [
        'x < 1',
        'x DATA 1onePc1:2twoPc2:PcMerge',
        'x >',
      ];
      const received = [];
      const brackets = [];

      out.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case 'data':
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case 'closeBracket':
            received.push(`${ip.scope} >`);
            brackets.pop();
            break;
        }
      });
      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(received).to.eql(expected);
        chai.expect(wasStarted).to.equal(true);
        done();
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);

      c.start()
        .then(() => {
          in2.post(new noflo.IP('data', 'two',
            { scope: 'x' }));
          in1.post(new noflo.IP('openBracket', 1,
            { scope: 'x' }));
          in1.post(new noflo.IP('data', 'one',
            { scope: 'x' }));
          in1.post(new noflo.IP('closeBracket', 1,
            { scope: 'x' }));
        }, done);
    });
  });
  describe('Process API mixed with legacy merging two inputs', () => {
    let c = null;
    let in1 = null;
    let in2 = null;
    let out = null;
    before(() => {
      const fbpData = 'INPORT=Leg1.IN:IN1\n'
                    + 'INPORT=Leg2.IN:IN2\n'
                    + 'OUTPORT=Leg3.OUT:OUT\n'
                    + 'Leg1(legacy/Sync) OUT -> IN1 PcMerge(process/Merge)\n'
                    + 'Leg2(legacy/Sync) OUT -> IN2 PcMerge(process/Merge)\n'
                    + 'PcMerge OUT -> IN Leg3(legacy/Sync)\n';
      return noflo.graph.loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'Merge', g);
          return loader.load('scope/Merge');
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          in2 = noflo.internalSocket.createSocket();
          c.inPorts.in2.attach(in2);
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it('should forward new-style brackets as expected', (done) => {
      const expected = [
        'CONN',
        '< 1',
        '< a',
        'DATA 1bazLeg1:2fooLeg2:PcMergeLeg3',
        '>',
        '>',
        'DISC',
      ];
      const received = [];

      out.on('connect', () => {
        received.push('CONN');
      });
      out.on('begingroup', (group) => {
        received.push(`< ${group}`);
      });
      out.on('data', (data) => {
        received.push(`DATA ${data}`);
      });
      out.on('endgroup', () => {
        received.push('>');
      });
      out.on('disconnect', () => {
        received.push('DISC');
      });

      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(received).to.eql(expected);
        chai.expect(wasStarted).to.equal(true);
        done();
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);

      c.start()
        .then(() => {
          in2.connect();
          in2.send('foo');
          in2.disconnect();
          in1.connect();
          in1.beginGroup(1);
          in1.beginGroup('a');
          in1.send('baz');
          in1.endGroup();
          in1.endGroup();
          in1.disconnect();
        }, done);
    });
    it('should forward new-style brackets as expected regardless of sending order', (done) => {
      const expected = [
        'CONN',
        '< 1',
        '< a',
        'DATA 1bazLeg1:2fooLeg2:PcMergeLeg3',
        '>',
        '>',
        'DISC',
      ];
      const received = [];

      out.on('connect', () => {
        received.push('CONN');
      });
      out.on('begingroup', (group) => {
        received.push(`< ${group}`);
      });
      out.on('data', (data) => {
        received.push(`DATA ${data}`);
      });
      out.on('endgroup', () => {
        received.push('>');
      });
      out.on('disconnect', () => {
        received.push('DISC');
      });

      let wasStarted = false;
      const checkStart = function () {
        chai.expect(wasStarted).to.equal(false);
        wasStarted = true;
      };
      const checkEnd = function () {
        chai.expect(received).to.eql(expected);
        chai.expect(wasStarted).to.equal(true);
        done();
      };
      c.network.once('start', checkStart);
      c.network.once('end', checkEnd);

      c.start()
        .then(() => {
          in1.connect();
          in1.beginGroup(1);
          in1.beginGroup('a');
          in1.send('baz');
          in1.endGroup();
          in1.endGroup();
          in1.disconnect();
          in2.connect();
          in2.send('foo');
          in2.disconnect();
        }, done);
    });
  });
  describe('with a Process API Generator component', () => {
    let c = null;
    let start = null;
    let stop = null;
    let out = null;
    before((done) => {
      const fbpData = 'INPORT=PcGen.START:START\n'
                    + 'INPORT=PcGen.STOP:STOP\n'
                    + 'OUTPORT=Pc.OUT:OUT\n'
                    + 'PcGen(process/Generator) OUT -> IN Pc(process/Async)\n';
      noflo.graph.loadFBP(fbpData)
        .then((g) => {
          loader.registerComponent('scope', 'Connected', g);
          return loader.load('scope/Connected');
        })
        .then((instance) => {
          instance.once('ready', () => {
            c = instance;
            start = noflo.internalSocket.createSocket();
            c.inPorts.start.attach(start);
            stop = noflo.internalSocket.createSocket();
            c.inPorts.stop.attach(stop);
            done();
          });
        })
        .catch(done);
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it('should not be running initially', () => {
      chai.expect(c.network.isRunning()).to.equal(false);
    });
    it('should not be running even when network starts', () => c.start()
      .then(() => {
        chai.expect(c.network.isRunning()).to.equal(false);
      }));
    it('should start generating when receiving a start packet', (done) => {
      c.start()
        .then(() => {
          out.once('data', () => {
            chai.expect(c.network.isRunning()).to.equal(true);
            done();
          });
          start.send(true);
        }, done);
    });
    it('should stop generating when receiving a stop packet', (done) => {
      c.start()
        .then(() => {
          out.once('data', () => {
            chai.expect(c.network.isRunning()).to.equal(true);
            stop.send(true);
            setTimeout(() => {
              chai.expect(c.network.isRunning()).to.equal(false);
              done();
            }, 10);
          });
          start.send(true);
        }, done);
    });
  });
});
