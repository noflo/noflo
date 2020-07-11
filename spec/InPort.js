/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let chai, noflo;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { chai = require('chai'); }
  noflo = require('../src/lib/NoFlo');
} else {
  noflo = require('noflo');
}

describe('Inport Port', function() {
  describe('with default options', function() {
    const p = new noflo.InPort;
    it('should be of datatype "all"', function() {
      chai.expect(p.getDataType()).to.equal('all');
    });
    it('should not be required', function() {
      chai.expect(p.isRequired()).to.equal(false);
    });
    it('should not be addressable', function() {
      chai.expect(p.isAddressable()).to.equal(false);
    });
    it('should not be buffered', () => chai.expect(p.isBuffered()).to.equal(false));
  });
  describe('with custom type', function() {
    const p = new noflo.InPort({
      datatype: 'string',
      schema: 'text/url'
    });
    it('should retain the type', function() {
      chai.expect(p.getDataType()).to.equal('string');
      chai.expect(p.getSchema()).to.equal('text/url');
    });
  });
  describe('without attached sockets', function() {
    const p = new noflo.InPort;
    it('should not be attached', function() {
      chai.expect(p.isAttached()).to.equal(false);
      chai.expect(p.listAttached()).to.eql([]);
    });
    it('should allow attaching', function() {
      chai.expect(p.canAttach()).to.equal(true);
    });
    it('should not be connected initially', function() {
      chai.expect(p.isConnected()).to.equal(false);
    });
    it('should not contain a socket initially', function() {
      chai.expect(p.sockets.length).to.equal(0);
    });
  });
  describe('with processing function called with port as context', function() {
    it('should set context to port itself', function(done) {
      const s = new noflo.internalSocket.InternalSocket;
      const p = new noflo.InPort;
      p.on('data', function(packet, component) {
        chai.expect(this).to.equal(p);
        chai.expect(packet).to.equal('some-data');
        done();
      });
      p.attach(s);
      s.send('some-data');
    });
  });
  describe('with default value', function() {
    let s;
    let p = (s = null);
    beforeEach(function() {
      p = new noflo.InPort({
        default: 'default-value'});
      s = new noflo.internalSocket.InternalSocket;
      p.attach(s);
    });
    it('should send the default value as a packet, though on next tick after initialization', function(done) {
      p.on('data', function(data) {
        chai.expect(data).to.equal('default-value');
        done();
      });
      s.send();
    });
    it('should send the default value before IIP', function(done) {
      const received = ['default-value', 'some-iip'];
      p.on('data', function(data) {
        chai.expect(data).to.equal(received.shift());
        if (received.length === 0) { done(); }
      });
      setTimeout(function() {
        s.send();
        s.send('some-iip');
      }
      , 0);
    });
  });
  describe('with options stored in port', function() {
    it('should store all provided options in port, whether we expect it or not', function() {
      const options = {
        datatype: 'string',
        type: 'http://schema.org/Person',
        description: 'Person',
        required: true,
        weNeverExpectThis: 'butWeStoreItAnyway'
      };
      const p = new noflo.InPort(options);
      for (let name in options) {
        const option = options[name];
        chai.expect(p.options[name]).to.equal(option);
      }
    });
  });
  describe('with data type information', function() {
    const right = 'all string number int object array'.split(' ');
    const wrong = 'not valie data types'.split(' ');
    const f = datatype => new noflo.InPort({
      datatype});
    right.forEach(function(r) {
      it(`should accept a '${r}' data type`, () => {
        chai.expect(() => f(r)).to.not.throw();
      });
    });
    wrong.forEach(function(w) {
      it(`should NOT accept a '${w}' data type`, () => {
        chai.expect(() => f(w)).to.throw();
      });
    });
  });
  describe('with TYPE (i.e. ontology) information', function() {
    const f = type => new noflo.InPort({
      type});
    it('should be a URL or MIME', function() {
      chai.expect(() => f('http://schema.org/Person')).to.not.throw();
      chai.expect(() => f('text/javascript')).to.not.throw();
      chai.expect(() => f('neither-a-url-nor-mime')).to.throw();
    });
  });
  describe('with accepted enumerated values', function() {
    it('should accept certain values', function(done) {
      const p = new noflo.InPort({
        values: 'noflo is awesome'.split(' ')});
      const s = new noflo.internalSocket.InternalSocket;
      p.attach(s);
      p.on('data', function(data) {
        chai.expect(data).to.equal('awesome');
        done();
      });
      s.send('awesome');

    });
    it('should throw an error if value is not accepted', function() {
      const p = new noflo.InPort({
        values: 'noflo is awesome'.split(' ')});
      const s = new noflo.internalSocket.InternalSocket;
      p.attach(s);
      p.on('data', function() {
        // Fail the test, we shouldn't have received anything
        chai.expect(true).to.be.equal(false);
      });
      chai.expect(() => s.send('terrific')).to.throw;
    });
  });
  describe('with processing shorthand', function() {
    it('should also accept metadata (i.e. options) when provided', function(done) {
      const s = new noflo.internalSocket.InternalSocket;
      const expectedEvents = [
        'connect',
        'data',
        'disconnect'
      ];
      const ps = {
        outPorts: new noflo.OutPorts({
          out: new noflo.OutPort}),
        inPorts: new noflo.InPorts
      };
      ps.inPorts.add('in', {
        datatype: 'string',
        required: true
      }
      );
      ps.inPorts.in.on('ip', function(ip) {
        if (ip.type !== 'data') { return; }
        chai.expect(ip.data).to.equal('some-data');
        done();
      });
      ps.inPorts.in.attach(s);
      chai.expect(ps.inPorts.in.listAttached()).to.eql([0]);
      s.send('some-data');
      s.disconnect();

    });
    it('should translate IP objects to legacy events', function(done) {
      const s = new noflo.internalSocket.InternalSocket;
      const expectedEvents = [
        'connect',
        'data',
        'disconnect'
      ];
      const receivedEvents = [];
      const ps = {
        outPorts: new noflo.OutPorts({
          out: new noflo.OutPort}),
        inPorts: new noflo.InPorts
      };
      ps.inPorts.add('in', {
        datatype: 'string',
        required: true
      }
      );
      ps.inPorts.in.on('connect', function() {
        receivedEvents.push('connect');
      });
      ps.inPorts.in.on('data', function() {
        receivedEvents.push('data');
      });
      ps.inPorts.in.on('disconnect', function() {
        receivedEvents.push('disconnect');
        chai.expect(receivedEvents).to.eql(expectedEvents);
        done();
      });
      ps.inPorts.in.attach(s);
      chai.expect(ps.inPorts.in.listAttached()).to.eql([0]);
      s.post(new noflo.IP('data', 'some-data'));

    });
    it('should stamp an IP object with the port\'s datatype', function(done) {
      const p = new noflo.InPort({
        datatype: 'string'});
      p.on('ip', function(data) {
        chai.expect(data).to.be.an('object');
        chai.expect(data.type).to.equal('data');
        chai.expect(data.data).to.equal('Hello');
        chai.expect(data.datatype).to.equal('string');
        done();
      });
      p.handleIP(new noflo.IP('data', 'Hello'));
    });
    it('should keep an IP object\'s datatype as-is if already set', function(done) {
      const p = new noflo.InPort({
        datatype: 'string'});
      p.on('ip', function(data) {
        chai.expect(data).to.be.an('object');
        chai.expect(data.type).to.equal('data');
        chai.expect(data.data).to.equal(123);
        chai.expect(data.datatype).to.equal('integer');
        done();
      });
      p.handleIP(new noflo.IP('data', 123,
        {datatype: 'integer'})
      );

    });
    it('should stamp an IP object with the port\'s schema', function(done) {
      const p = new noflo.InPort({
        datatype: 'string',
        schema: 'text/markdown'
      });
      p.on('ip', function(data) {
        chai.expect(data).to.be.an('object');
        chai.expect(data.type).to.equal('data');
        chai.expect(data.data).to.equal('Hello');
        chai.expect(data.datatype).to.equal('string');
        chai.expect(data.schema).to.equal('text/markdown');
        done();
      });
      p.handleIP(new noflo.IP('data', 'Hello'));
    });
    it('should keep an IP object\'s schema as-is if already set', function(done) {
      const p = new noflo.InPort({
        datatype: 'string',
        schema: 'text/markdown'
      });
      p.on('ip', function(data) {
        chai.expect(data).to.be.an('object');
        chai.expect(data.type).to.equal('data');
        chai.expect(data.data).to.equal('Hello');
        chai.expect(data.datatype).to.equal('string');
        chai.expect(data.schema).to.equal('text/plain');
        done();
      });
      p.handleIP(new noflo.IP('data', 'Hello', {
        datatype: 'string',
        schema: 'text/plain'
      }
      )
      );
    });
  });
});