import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as noflo from '../src/lib/NoFlo.js';

describe('NoFlo loaded as ES module', () => {
  it('should be runnable', () => {
    assert.equal(typeof noflo, 'object');
    assert.equal(typeof noflo.Component, 'function');
  });
});

