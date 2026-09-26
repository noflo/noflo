const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const noflo = require('../lib/NoFlo.js');

describe('NoFlo loaded as CommonJS module', () => {
  it('should be runnable', () => {
    assert.equal(typeof noflo, 'object');
    assert.equal(typeof noflo.Component, 'function');
  });
});
