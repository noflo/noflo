let chai; let noflo;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { chai = require('chai'); }
  noflo = require('../src/lib/NoFlo');
} else {
  noflo = require('noflo');
}

describe('MergeObjects component', () => {
  let c = null;
  let sin1 = null;
  let sin2 = null;
  let sin3 = null;
  let sout1 = null;
  let sout2 = null;
  const obj1 = {
    name: 'Patrick',
    age: 21,
  };
  const obj2 = {
    title: 'Attorney',
    age: 33,
  };
  before(function (done) {
    if (noflo.isBrowser()) {
      this.skip();
      return;
    }
    const MergeObjects = require('./components/MergeObjects.coffee');
    c = MergeObjects.getComponent();
    sin1 = new noflo.internalSocket.InternalSocket();
    sin2 = new noflo.internalSocket.InternalSocket();
    sin3 = new noflo.internalSocket.InternalSocket();
    sout1 = new noflo.internalSocket.InternalSocket();
    sout2 = new noflo.internalSocket.InternalSocket();
    c.inPorts.obj1.attach(sin1);
    c.inPorts.obj2.attach(sin2);
    c.inPorts.overwrite.attach(sin3);
    c.outPorts.result.attach(sout1);
    c.outPorts.error.attach(sout2);
    done();
  });
  beforeEach((done) => {
    sout1.removeAllListeners();
    sout2.removeAllListeners();
    done();
  });

  it('should not trigger if input is not complete', (done) => {
    sout1.once('ip', () => {
      done(new Error('Premature result'));
    });
    sout2.once('ip', () => {
      done(new Error('Premature error'));
    });

    sin1.post(new noflo.IP('data', obj1));
    sin2.post(new noflo.IP('data', obj2));

    setTimeout(done, 10);
  });

  it('should merge objects when input is complete', (done) => {
    sout1.once('ip', (ip) => {
      chai.expect(ip).to.be.an('object');
      chai.expect(ip.type).to.equal('data');
      chai.expect(ip.data).to.be.an('object');
      chai.expect(ip.data.name).to.equal(obj1.name);
      chai.expect(ip.data.title).to.equal(obj2.title);
      chai.expect(ip.data.age).to.equal(obj1.age);
      done();
    });
    sout2.once('ip', (ip) => {
      done(ip);
    });

    sin3.post(new noflo.IP('data', false));
  });

  it('should obey the overwrite control', (done) => {
    sout1.once('ip', (ip) => {
      chai.expect(ip).to.be.an('object');
      chai.expect(ip.type).to.equal('data');
      chai.expect(ip.data).to.be.an('object');
      chai.expect(ip.data.name).to.equal(obj1.name);
      chai.expect(ip.data.title).to.equal(obj2.title);
      chai.expect(ip.data.age).to.equal(obj2.age);
      done();
    });
    sout2.once('ip', (ip) => {
      done(ip);
    });

    sin3.post(new noflo.IP('data', true));
    sin1.post(new noflo.IP('data', obj1));
    sin2.post(new noflo.IP('data', obj2));
  });
});
