/* eslint-env node, mocha */
const { expect } = require('chai');
const Wrapper = require('noflo-wrapper');

const getBuildFrame = require('../example/components/BuildFrame').getComponent;
const getMountEngine = require('../example/components/MountEngine').getComponent;

describe('Assembly Component', () => {
  describe('of simple relay kind', () => {
    let c;
    before((done) => {
      c = new Wrapper(getBuildFrame);
      c.start((err) => {
        if (err) { done(err); return; }
        done();
      });
    });

    it('should modify the message', (done) => {
      c.receive('out', (msg) => {
        expect(msg).to.be.an('object');
        expect(msg.errors).to.have.lengthOf(0);
        expect(msg.id).to.equal(123);
        expect(msg.chassis).to.be.an('object');
        expect(msg.chassis.id).to.equal(msg.id);
        done();
      });

      // Generate a simple message
      const msg = {
        errors: [],
        id: 123,
      };

      c.send({ in: msg });
    });

    it('should validate the message automatically', (done) => {
      c.receive('out', (msg) => {
        expect(msg).to.be.an('object');
        expect(msg.errors).to.have.length.above(0);
        expect(msg.errors[0]).to.be.an('error');
        expect(msg.errors[0].message).to.contain('not a number');
        done();
      });

      const msg = {
        errors: [],
        oops: 'id is not here',
      };

      c.send({ in: msg });
    });
  });

  describe('with multiple inports', () => {
    let c;
    before((done) => {
      c = new Wrapper(getMountEngine);
      c.start((err) => {
        if (err) { done(err); return; }
        done();
      });
    });

    it('should handle the input', (done) => {
      c.receive('out', (msg) => {
        expect(msg).to.be.an('object');
        expect(msg.errors).to.have.lengthOf(0);
        expect(msg.id).to.equal(123);
        expect(msg.chassis.frame).to.equal('Wooden Frame');
        expect(msg.chassis.engine).to.equal('Steam Engine');
        done();
      });

      const msg = {
        errors: [],
        id: 123,
        chassis: {
          id: 123,
          frame: 'Wooden Frame',
        },
      };

      c.send({
        in: msg,
        engine: 'Steam Engine',
      });
    });

    it('should perform manual validation', (done) => {
      c.receive('out', (msg) => {
        expect(msg).to.be.an('object');
        expect(msg.errors).to.have.length.above(0);
        expect(msg.errors[0]).to.be.an('error');
        expect(msg.errors[0].message).to.contain('not an object');
        done();
      });

      const msg = {
        errors: [],
        oops: 'chassis is not here',
      };

      c.send({
        in: msg,
        engine: 'FooBar',
      });
    });
  });
});
