import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import * as noflo from '../src/lib/NoFlo.js';

describe('Ports collection', () => {
  describe('InPorts', () => {
    const p = new noflo.InPorts();
    it('should initially contain no ports', () => {
      assert.deepStrictEqual(p.ports, {});
    });
    it('should allow adding a port', () => {
      p.add('foo',
        { datatype: 'string' });
      assert.strictEqual(typeof p.ports.foo, "object");
      chai.expect(p.ports.foo.getDataType()).to.equal('string');
    });
    it('should allow overriding  a port', () => {
      p.add('foo',
        { datatype: 'boolean' });
      assert.strictEqual(typeof p.ports.foo, "object");
      chai.expect(p.ports.foo.getDataType()).to.equal('boolean');
    });
    it('should throw if trying to add an \'add\' port', () => {
      chai.expect(() => p.add('add')).to.throw();
    });
    it('should throw if trying to add an \'remove\' port', () => {
      chai.expect(() => p.add('remove')).to.throw();
    });
    it('should throw if trying to add a port with invalid characters', () => {
      chai.expect(() => p.add('hello world!')).to.throw();
    });
    it('should throw if trying to remove a port that doesn\'t exist', () => {
      chai.expect(() => p.remove('bar')).to.throw();
    });
    it('should throw if trying to subscribe to a port that doesn\'t exist', () => {
      chai.expect(() => p.once('bar', 'ip', () => {})).to.throw();
      chai.expect(() => p.on('bar', 'ip', () => {})).to.throw();
    });
    it('should allow subscribing to an existing port', (done) => {
      let received = 0;
      p.ports.foo.once('ip', () => {
        received++;
        if (received === 2) { done(); }
      });
      p.ports.foo.on('ip', () => {
        received++;
        if (received === 2) { done(); }
      });
      p.foo.handleIP(new noflo.IP('data', null));
    });
    it('should be able to remove a port', () => {
      p.remove('foo');
      assert.deepStrictEqual(p.ports, {});
    });
  });
  describe('OutPorts', () => {
    const p = new noflo.OutPorts();
    it('should initially contain no ports', () => {
      assert.deepStrictEqual(p.ports, {});
    });
    it('should allow adding a port', () => {
      p.add('foo',
        { datatype: 'string' });
      assert.strictEqual(typeof p.ports.foo, "object");
      chai.expect(p.ports.foo.getDataType()).to.equal('string');
    });
    it('should throw if trying to add an \'add\' port', () => {
      chai.expect(() => p.add('add')).to.throw();
    });
    it('should throw if trying to add an \'remove\' port', () => {
      chai.expect(() => p.add('remove')).to.throw();
    });
    it('should throw when calling connect with port that doesn\'t exist', () => {
      chai.expect(() => p.connect('bar')).to.throw();
    });
    it('should throw when calling beginGroup with port that doesn\'t exist', () => {
      chai.expect(() => p.beginGroup('bar')).to.throw();
    });
    it('should throw when calling send with port that doesn\'t exist', () => {
      chai.expect(() => p.send('bar')).to.throw();
    });
    it('should throw when calling endGroup with port that doesn\'t exist', () => {
      chai.expect(() => p.endGroup('bar')).to.throw();
    });
    it('should throw when calling disconnect with port that doesn\'t exist', () => {
      chai.expect(() => p.disconnect('bar')).to.throw();
    });
  });
});
