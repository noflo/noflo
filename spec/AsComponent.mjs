import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import * as noflo from '../src/lib/NoFlo.js';
let isBrowser;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  isBrowser = false;
} else {
  isBrowser = true;
}
describe('asComponent interface', () => {
  let loader = null;
  before(() => {
    loader = new noflo.ComponentLoader(process.cwd());
    return loader.listComponents();
  });
  describe('with a synchronous function taking a single parameter', () => {
    describe('with returned value', () => {
      const func = (hello) => `Hello ${hello}`;
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-one', component, done);
      });
      it('should be loadable', () => {
        return loader.load('ascomponent/sync-one');
      });
      it('should contain correct ports', () => {
        return loader.load('ascomponent/sync-one')
          .then((instance) => {
            assert.deepEqual(Object.keys(instance.inPorts.ports), ['hello']);
            assert.deepEqual(Object.keys(instance.outPorts.ports), ['out', 'error']);
          });
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-one',
          { loader });
        wrapped('World', (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, 'Hello World');
          done();
        });
      });
      it('should forward brackets to OUT port', (_t, done) => {
        loader.load('ascomponent/sync-one', (err, instance) => {
          if (err) {
            done(err);
            return;
          }
          const ins = noflo.internalSocket.createSocket();
          const out = noflo.internalSocket.createSocket();
          const error = noflo.internalSocket.createSocket();
          instance.inPorts.hello.attach(ins);
          instance.outPorts.out.attach(out);
          instance.outPorts.error.attach(error);
          const received = [];
          const expected = [
            'openBracket a',
            'data Hello Foo',
            'data Hello Bar',
            'data Hello Baz',
            'closeBracket a',
          ];
          error.once('data', (data) => done(data));
          out.on('ip', (ip) => {
            received.push(`${ip.type} ${ip.data}`);
            if (received.length !== expected.length) { return; }
            assert.deepStrictEqual(received, expected);
            done();
          });
          ins.post(new noflo.IP('openBracket', 'a'));
          ins.post(new noflo.IP('data', 'Foo'));
          ins.post(new noflo.IP('data', 'Bar'));
          ins.post(new noflo.IP('data', 'Baz'));
          ins.post(new noflo.IP('closeBracket', 'a'));
        });
      });
    });
    describe('with returned NULL', () => {
      const func = () => null;
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-null', component, done);
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-null',
          { loader });
        wrapped('World', (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, null);
          done();
        });
      });
    });
    describe('with a thrown exception', () => {
      const func = (hello) => {
        throw new Error(`Hello ${hello}`);
      };
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-throw', component, done);
      });
      it('should send to ERROR port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-throw',
          { loader });
        wrapped('Error', (err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.strictEqual(err.message, 'Hello Error');
          done();
        });
      });
    });
  });
  describe('with a synchronous function taking a multiple parameters', () => {
    describe('with returned value', () => {
      const func = (greeting, name) => `${greeting} ${name}`;
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-two', component, done);
      });
      it('should be loadable', (_t, done) => {
        loader.load('ascomponent/sync-two', done);
      });
      it('should contain correct ports', (_t, done) => {
        loader.load('ascomponent/sync-two', (err, instance) => {
          if (err) {
            done(err);
            return;
          }
          assert.deepEqual(Object.keys(instance.inPorts.ports), ['greeting', 'name']);
          assert.deepEqual(Object.keys(instance.outPorts.ports), ['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-two',
          { loader });
        wrapped({
          greeting: 'Hei',
          name: 'Maailma',
        },
        (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.deepStrictEqual(res, { out: 'Hei Maailma' });
          done();
        });
      });
    });
    describe('with a default value', () => {
      before(function () {
        if (isBrowser) { return this.skip(); }
      }); // Browser runs with ES5 which didn't have defaults
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent((name, greeting = 'Hello') => `${greeting} ${name}`);
        loader.registerComponent('ascomponent', 'sync-default', component, done);
      });
      it('should be loadable', (_t, done) => {
        loader.load('ascomponent/sync-default', done);
      });
      it('should contain correct ports', (_t, done) => {
        loader.load('ascomponent/sync-default', (err, instance) => {
          if (err) {
            done(err);
            return;
          }
          assert.deepEqual(Object.keys(instance.inPorts.ports), ['name', 'greeting']);
          assert.deepEqual(Object.keys(instance.outPorts.ports), ['out', 'error']);
          assert.equal(instance.inPorts.name.isRequired(), true);
          assert.equal(instance.inPorts.name.hasDefault(), false);
          assert.equal(instance.inPorts.greeting.isRequired(), false);
          assert.equal(instance.inPorts.greeting.hasDefault(), true);
          done();
        });
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-default',
          { loader });
        wrapped(
          { name: 'Maailma' },
          (err, res) => {
            if (err) {
              done(err);
              return;
            }
            assert.deepStrictEqual(res, { out: 'Hello Maailma' });
            done();
          },
        );
      });
    });
  });
  describe('with a function returning a Promise', () => {
    describe('with a resolved promise', () => {
      before(function () {
        if (isBrowser && (typeof window.Promise === 'undefined')) { return this.skip(); }
      });
      const func = (hello) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(`Hello ${hello}`);
        }, 5);
      });
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'promise-one', component, done);
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/promise-one',
          { loader });
        wrapped('World', (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, 'Hello World');
          done();
        });
      });
    });
    describe('with a rejected promise', () => {
      before(function () {
        if (isBrowser && (typeof window.Promise === 'undefined')) {
          this.skip();
        }
      });
      const func = (hello) => new Promise((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Hello ${hello}`));
        }, 5);
      });
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-throw', component, done);
      });
      it('should send to ERROR port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-throw',
          { loader });
        wrapped('Error', (err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.strictEqual(err.message, 'Hello Error');
          done();
        });
      });
    });
  });
  describe('with a synchronous function taking zero parameters', () => {
    describe('with returned value', () => {
      const func = () => 'Hello there';
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-zero', component, done);
      });
      it('should contain correct ports', (_t, done) => {
        loader.load('ascomponent/sync-zero', (err, instance) => {
          if (err) {
            done(err);
            return;
          }
          assert.deepEqual(Object.keys(instance.inPorts.ports), ['in']);
          assert.deepEqual(Object.keys(instance.outPorts.ports), ['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-zero',
          { loader });
        wrapped('bang', (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, 'Hello there');
          done();
        });
      });
    });
    describe('with a built-in function', () => {
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(Math.random);
        loader.registerComponent('ascomponent', 'sync-zero', component, done);
      });
      it('should contain correct ports', (_t, done) => {
        loader.load('ascomponent/sync-zero', (err, instance) => {
          if (err) {
            done(err);
            return;
          }
          assert.deepEqual(Object.keys(instance.inPorts.ports), ['in']);
          assert.deepEqual(Object.keys(instance.outPorts.ports), ['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/sync-zero',
          { loader });
        wrapped('bang', (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(typeof res, "number");
          done();
        });
      });
    });
  });
  describe('with an asynchronous function taking a single parameter and callback', () => {
    describe('with successful callback', () => {
      const func = (hello, callback) => {
        setTimeout(() => callback(null, `Hello ${hello}`),
          5);
      };
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'async-one', component, done);
      });
      it('should be loadable', (_t, done) => {
        loader.load('ascomponent/async-one', done);
      });
      it('should contain correct ports', (_t, done) => {
        loader.load('ascomponent/async-one', (err, instance) => {
          if (err) {
            done(err);
            return;
          }
          assert.deepEqual(Object.keys(instance.inPorts.ports), ['hello']);
          assert.deepEqual(Object.keys(instance.outPorts.ports), ['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/async-one',
          { loader });
        wrapped('World', (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, 'Hello World');
          done();
        });
      });
    });
    describe('with failed callback', () => {
      const func = (hello, callback) => {
        setTimeout(() => callback(new Error(`Hello ${hello}`)),
          5);
      };
      it('should be possible to componentize', (_t, done) => {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'async-throw', component, done);
      });
      it('should send to ERROR port', (_t, done) => {
        const wrapped = noflo.asCallback('ascomponent/async-throw',
          { loader });
        wrapped('Error', (err) => {
          assert.strictEqual(Error.isError(err), true)
          assert.strictEqual(err.message, 'Hello Error');
          done();
        });
      });
    });
  });
});
