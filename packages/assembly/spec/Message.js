/* eslint-env node, mocha */
const { expect } = require('chai');
const {
  fail,
  failed,
  fork,
  merge,
} = require('../index');

describe('Message Helpers', () => {
  describe('failing and detection', () => {
    let msg;
    before((done) => {
      msg = {
        errors: [],
      };
      done();
    });

    it('fail() should add errors', (done) => {
      const err = new Error('Something went wrong');
      msg = fail(msg, err);
      expect(msg.errors).to.have.lengthOf(1);
      expect(msg.errors[0]).to.equal(err);
      done();
    });

    it('failed() should check for errors', (done) => {
      expect(failed(msg)).to.be.true;
      done();
    });
  });

  describe('forking and merging', () => {
    let msg;
    let msg2;
    before((done) => {
      msg = {
        errors: [],
        id: 123,
        tmp: [],
        immute: { able: true },
      };
      done();
    });

    it('fork() should fork a message', (done) => {
      msg2 = fork(msg, ['tmp'], ['immute']);
      // Referencing the same errors is critical
      expect(msg2.errors).to.equal(msg.errors);
      expect(msg2.id).to.equal(msg.id);
      // Exclude option
      expect(msg2.tmp).to.be.undefined;
      // Clone option
      expect(msg2.immute).to.not.equal(msg.immute);
      expect(msg2.immute.able).to.be.true;
      msg2.immute.able = false;
      expect(msg.immute.able).to.be.true;
      done();
    });

    it('merge() should merge forked messages', (done) => {
      msg.tmp.push('foo');
      msg2.response = {
        code: 200,
        message: 'OK',
      };
      msg = merge(msg, msg2);
      expect(msg.id).to.equal(123);
      // Properties are merged
      expect(msg.tmp).to.be.an.instanceof(Array);
      expect(msg.tmp).to.have.lengthOf(1);
      expect(msg.response).to.be.an('object');
      expect(msg.response.code).to.equal(200);
      // First message takes precedence
      expect(msg.immute.able).to.be.true;
      done();
    });
  });
});
