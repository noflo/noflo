/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let chai, isBrowser, noflo, root, urlPrefix;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { chai = require('chai'); }
  noflo = require('../src/lib/NoFlo');
  const path = require('path');
  root = path.resolve(__dirname, '../');
  urlPrefix = './';
  isBrowser = false;
} else {
  noflo = require('noflo');
  root = 'noflo';
  urlPrefix = '/';
  isBrowser = true;
}

describe('asComponent interface', function() {
  let loader = null;
  before(function(done) {
    loader = new noflo.ComponentLoader(root);
    loader.listComponents(done);
  });
  describe('with a synchronous function taking a single parameter', function() {
    describe('with returned value', function() {
      const func = hello => `Hello ${hello}`;
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-one', component, done);
      });
      it('should be loadable', function(done) {
        loader.load('ascomponent/sync-one', done);
      });
      it('should contain correct ports', function(done) {
        loader.load('ascomponent/sync-one', function(err, instance) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql(['hello']);
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql(['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-one',
          {loader});
        wrapped('World', function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.equal('Hello World');
          done();
        });
      });
      it('should forward brackets to OUT port', function(done) {
        loader.load('ascomponent/sync-one', function(err, instance) {
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
            'closeBracket a'
          ];
          error.once('data', data => done(data));
          out.on('ip', function(ip) {
            received.push(`${ip.type} ${ip.data}`);
            if (received.length !== expected.length) { return; }
            chai.expect(received).to.eql(expected);
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
    describe('with returned NULL', function() {
      const func = hello => null;
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-null', component, done);
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-null',
          {loader});
        wrapped('World', function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.be.a('null');
          done();
        });
      });
    });
    describe('with a thrown exception', function() {
      const func = function(hello) {
        throw new Error(`Hello ${hello}`);
      };
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-throw', component, done);
      });
      it('should send to ERROR port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-throw',
          {loader});
        wrapped('Error', function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.equal('Hello Error');
          done();
        });
      });
    });
  });
  describe('with a synchronous function taking a multiple parameters', function() {
    describe('with returned value', function() {
      const func = (greeting, name) => `${greeting} ${name}`;
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-two', component, done);
      });
      it('should be loadable', function(done) {
        loader.load('ascomponent/sync-two', done);
      });
      it('should contain correct ports', function(done) {
        loader.load('ascomponent/sync-two', function(err, instance) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql(['greeting', 'name']);
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql(['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-two',
          {loader});
        wrapped({
          greeting: 'Hei',
          name: 'Maailma'
        }
        , function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.eql({
            out: 'Hei Maailma'});
          done();
        });
      });
    });
    describe('with a default value', function() {
      before(function() {
        if (isBrowser) { return this.skip(); }
      }); // Browser runs with ES5 which didn't have defaults
      const func = function(name, greeting) {
        if (greeting == null) { greeting = 'Hello'; }
        return `${greeting} ${name}`;
      };
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-default', component, done);
      });
      it('should be loadable', function(done) {
        loader.load('ascomponent/sync-default', done);
      });
      it('should contain correct ports', function(done) {
        loader.load('ascomponent/sync-default', function(err, instance) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql(['name', 'greeting']);
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql(['out', 'error']);
          chai.expect(instance.inPorts.name.isRequired()).to.equal(true);
          chai.expect(instance.inPorts.name.hasDefault()).to.equal(false);
          chai.expect(instance.inPorts.greeting.isRequired()).to.equal(false);
          chai.expect(instance.inPorts.greeting.hasDefault()).to.equal(true);
          done();
        });
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-default',
          {loader});
        wrapped(
          {name: 'Maailma'}
        , function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.eql({
            out: 'Hello Maailma'});
          done();
        });
      });
    });
  });
  describe('with a function returning a Promise', function() {
    describe('with a resolved promise', function() {
      before(function() {
        if (isBrowser && (typeof window.Promise === 'undefined')) { return this.skip(); }
      });
      const func = hello => new Promise((resolve, reject) => setTimeout(() => resolve(`Hello ${hello}`)
      , 5));
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'promise-one', component, done);
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/promise-one',
          {loader});
        wrapped('World', function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.equal('Hello World');
          done();
        });
      });
    });
    describe('with a rejected promise', function() {
      before(function() {
        if (isBrowser && (typeof window.Promise === 'undefined')) {
          this.skip();
        }
      });
      const func = hello => new Promise((resolve, reject) => setTimeout(() => reject(new Error(`Hello ${hello}`))
      , 5));
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-throw', component, done);
      });
      it('should send to ERROR port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-throw',
          {loader});
        wrapped('Error', function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.equal('Hello Error');
          done();
        });
      });
    });
  });
  describe('with a synchronous function taking zero parameters', function() {
    describe('with returned value', function() {
      const func = () => "Hello there";
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'sync-zero', component, done);
      });
      it('should contain correct ports', function(done) {
        loader.load('ascomponent/sync-zero', function(err, instance) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql(['in']);
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql(['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-zero',
          {loader});
        wrapped('bang', function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.equal('Hello there');
          done();
        });
      });
    });
    describe('with a built-in function', function() {
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(Math.random);
        loader.registerComponent('ascomponent', 'sync-zero', component, done);
      });
      it('should contain correct ports', function(done) {
        loader.load('ascomponent/sync-zero', function(err, instance) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql(['in']);
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql(['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/sync-zero',
          {loader});
        wrapped('bang', function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.be.a('number');
          done();
        });
      });
    });
  });
  describe('with an asynchronous function taking a single parameter and callback', function() {
    describe('with successful callback', function() {
      const func = function(hello, callback) {
        setTimeout(() => callback(null, `Hello ${hello}`)
        , 5);
      };
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'async-one', component, done);
      });
      it('should be loadable', function(done) {
        loader.load('ascomponent/async-one', done);
      });
      it('should contain correct ports', function(done) {
        loader.load('ascomponent/async-one', function(err, instance) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(Object.keys(instance.inPorts.ports)).to.eql(['hello']);
          chai.expect(Object.keys(instance.outPorts.ports)).to.eql(['out', 'error']);
          done();
        });
      });
      it('should send to OUT port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/async-one',
          {loader});
        wrapped('World', function(err, res) {
          if (err) {
            done(err);
            return;
          }
          chai.expect(res).to.equal('Hello World');
          done();
        });
      });
    });
    describe('with failed callback', function() {
      const func = function(hello, callback) {
        setTimeout(() => callback(new Error(`Hello ${hello}`))
        , 5);
      };
      it('should be possible to componentize', function(done) {
        const component = () => noflo.asComponent(func);
        loader.registerComponent('ascomponent', 'async-throw', component, done);
      });
      it('should send to ERROR port', function(done) {
        const wrapped = noflo.asCallback('ascomponent/async-throw',
          {loader});
        wrapped('Error', function(err) {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.equal('Hello Error');
          done();
        });
      });
    });
  });
});
