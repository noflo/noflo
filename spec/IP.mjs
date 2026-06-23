import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import * as noflo from '../src/lib/NoFlo.js';

describe('IP object', () => {
  it('should create IPs of different types', () => {
    const open = new noflo.IP('openBracket');
    const data = new noflo.IP('data', 'Payload');
    const close = new noflo.IP('closeBracket');
    assert.strictEqual(open.type, 'openBracket');
    assert.strictEqual(close.type, 'closeBracket');
    assert.strictEqual(data.type, 'data');
  });
  it('should be moved to an owner', () => {
    const p = new noflo.IP('data', 'Token');
    p.move('SomeProc');
    assert.strictEqual(p.owner, 'SomeProc');
  });
  it('should support sync context scoping', () => {
    const p = new noflo.IP('data', 'Request-specific');
    p.scope = 'request-12345';
    assert.strictEqual(p.scope, 'request-12345');
  });
  it('should be able to clone itself', () => {
    const d1 = new noflo.IP('data', 'Trooper', {
      groups: ['foo', 'bar'],
      owner: 'SomeProc',
      scope: 'request-12345',
      clonable: true,
      datatype: 'string',
      schema: 'text/plain',
    });
    const d2 = d1.clone();
    chai.expect(d2).not.to.equal(d1);
    assert.strictEqual(d2.type, d1.type);
    assert.strictEqual(d2.schema, d1.schema);
    assert.deepStrictEqual(d2.data, d1.data);
    assert.deepStrictEqual(d2.groups, d2.groups);
    chai.expect(d2.owner).not.to.equal(d1.owner);
    assert.strictEqual(d2.scope, d1.scope);
  });
  it('should dispose its contents when dropped', () => {
    const p = new noflo.IP('data', 'Garbage');
    p.groups = ['foo', 'bar'];
    p.drop();
    chai.expect(Object.keys(p)).to.have.lengthOf(0);
  });
});
