/* eslint-env node, mocha */
import 'mocha';
import { expect } from 'chai';
import Tester from 'noflo-tester';
import { ComponentLoader } from 'noflo';
import { resolve } from 'path';
import load from '../example/ComponentLoader';

describe('Assembly Graph', () => {
  let loader;
  let c;
  before((done) => {
    // A bit of magic with custom loader for subfolder project to work
    loader = new ComponentLoader(resolve(__dirname, '../example'));
    loader.listComponents((err) => {
      if (err) { done(err); return; }
      load(loader, (err2) => {
        if (err2) { done(err2); return; }
        c = new Tester('', { loader });
        done();
      });
    });
  });

  describe('A simple pipeline graph', () => {
    before((done) => {
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
});
