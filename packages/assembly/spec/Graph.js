/* eslint-env node, mocha */
import 'mocha';
import { expect } from 'chai';
import Wrapper from 'noflo-wrapper';
import { ComponentLoader } from 'noflo';
import { resolve } from 'path';

describe('Assembly Graph', function bar() {
  this.timeout(5000);
  let loader;
  let c;
  before((done) => {
    // A bit of magic with custom loader for subfolder project to work
    loader = new ComponentLoader(resolve(__dirname, '../example'));
    loader.listComponents((err) => {
      if (err) { done(err); return; }
      done();
    });
  });

  describe('A simple pipeline graph', () => {
    before((done) => {
      c = new Wrapper('', { loader });
      c.component = 'example/BuildChassis';
      c.start((err) => {
        if (err) { done(err); return; }
        done();
      });
    });

    it('should build a car chassis', (done) => {
      c.receive('out', (msg) => {
        expect(msg).to.be.an('object');
        expect(msg.errors).to.have.lengthOf(0);
        expect(msg.id).to.equal(123);
        expect(msg.chassis).to.be.an('object');
        expect(msg.chassis.id).to.equal(msg.id);
        expect(msg.chassis.frame).to.equal('Steel Frame');
        expect(msg.chassis.engine).to.equal('Mercedes V8 5.0');
        expect(msg.chassis.transmission).to.equal('ZF Automatic 6-speed');
        expect(msg.chassis.driveShaft).to.be.ok;
        expect(msg.chassis.suspension).to.be.an('object');
        expect(msg.chassis.wheels).to.have.lengthOf(4);
        done();
      });

      // Place an order message
      const msg = {
        errors: [],
        id: 123,
      };

      c.send({ in: msg });
    });
  });

  describe('A graph with branches', () => {
    before((done) => {
      c = new Wrapper('', { loader });
      c.component = 'example/BuildBody';
      c.start((err) => {
        if (err) { done(err); return; }
        done();
      });
    });

    it('should build a car body', (done) => {
      c.receive('out', (msg) => {
        expect(msg).to.be.an('object');
        expect(msg.errors).to.have.lengthOf(0);
        expect(msg.id).to.equal(123);
        expect(msg.body).to.be.an('object');
        expect(msg.body.id).to.equal(msg.id);
        expect(msg.body.panels).to.be.ok;
        expect(msg.body.interior).to.be.ok;
        expect(msg.body.doors).to.have.lengthOf(4);
        expect(msg.body.electrics).to.be.ok;
        done();
      });

      // Place an order message
      const msg = {
        errors: [],
        id: 123,
      };

      c.send({ in: msg });
    });
  });

  describe('A top level graph with subgraphs', () => {
    before((done) => {
      c = new Wrapper('', { loader });
      c.component = 'example/BuildCar';
      c.start((err) => {
        if (err) { done(err); return; }
        done();
      });
    });

    it('should build a car', (done) => {
      c.receive('out', (msg) => {
        if (msg.errors.length) {
          msg.errors.forEach((err) => {
            console.log(err);
          });
        }
        expect(msg).to.be.an('object');
        expect(msg.errors).to.have.lengthOf(0);
        expect(msg.id).to.equal(1);
        expect(msg.chassis).to.be.an('object');
        expect(msg.body).to.be.an('object');
        // expect(msg.parts).to.be.undefined;
        done();
      });

      // Place an order message
      c.send({ in: true });
    });
  });
});
