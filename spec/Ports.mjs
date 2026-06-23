import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
      assert.equal(p.ports.foo.getDataType(), 'string');
    });
    it('should allow overriding  a port', () => {
      p.add('foo',
        { datatype: 'boolean' });
      assert.strictEqual(typeof p.ports.foo, "object");
      assert.equal(p.ports.foo.getDataType(), 'boolean');
    });
    it('should throw if trying to add an \'add\' port', () => {
      assert.throws(() => p.add('add'));
    });
    it('should throw if trying to add an \'remove\' port', () => {
      assert.throws(() => p.add('remove'));
    });
    it('should throw if trying to add a port with invalid characters', () => {
      assert.throws(() => p.add('hello world!'));
    });
    it('should throw if trying to remove a port that doesn\'t exist', () => {
      assert.throws(() => p.remove('bar'));
    });
    it('should throw if trying to subscribe to a port that doesn\'t exist', () => {
      assert.throws(() => p.once('bar', 'ip', () => {}));
      assert.throws(() => p.on('bar', 'ip', () => {}));
    });
    it('should allow subscribing to an existing port', (_t, done) => {
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
      assert.equal(p.ports.foo.getDataType(), 'string');
    });
    it('should throw if trying to add an \'add\' port', () => {
      assert.throws(() => p.add('add'));
    });
    it('should throw if trying to add an \'remove\' port', () => {
      assert.throws(() => p.add('remove'));
    });
    it('should throw when calling connect with port that doesn\'t exist', () => {
      assert.throws(() => p.connect('bar'));
    });
    it('should throw when calling beginGroup with port that doesn\'t exist', () => {
      assert.throws(() => p.beginGroup('bar'));
    });
    it('should throw when calling send with port that doesn\'t exist', () => {
      assert.throws(() => p.send('bar'));
    });
    it('should throw when calling endGroup with port that doesn\'t exist', () => {
      assert.throws(() => p.endGroup('bar'));
    });
    it('should throw when calling disconnect with port that doesn\'t exist', () => {
      assert.throws(() => p.disconnect('bar'));
    });
  });
});
