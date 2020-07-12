/* eslint-disable
    block-scoped-var,
    guard-for-in,
    no-unused-vars,
    no-use-before-define,
    no-var,
    vars-on-top,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let component; let IP; let
  socket;
if ((typeof process !== 'undefined') && process.execPath && process.execPath.match(/node|iojs/)) {
  if (!chai) { var chai = require('chai'); }
  component = require('../../src/lib/Component.js');
  socket = require('../../src/lib/InternalSocket.js');
  IP = require('../../src/lib/IP.js');
} else {
  component = require('noflo/src/lib/Component.js');
  socket = require('noflo/src/lib/InternalSocket.js');
  IP = require('noflo/src/lib/IP.js');
}

exports.getComponent = function () {
  const c = new component.Component({
    desciption: 'Merges two objects into one (cloning)',
    inPorts: {
      obj1: {
        datatype: 'object',
        desciption: 'First object',
      },
      obj2: {
        datatype: 'object',
        desciption: 'Second object',
      },
      overwrite: {
        datatype: 'boolean',
        desciption: 'Overwrite obj1 properties with obj2',
        control: true,
      },
    },
    outPorts: {
      result: {
        datatype: 'object',
      },
      error: {
        datatype: 'object',
      },
    },
  });

  return c.process((input, output) => {
    let dst; let
      src;
    if (!input.has('obj1', 'obj2', 'overwrite')) { return; }
    const [obj1, obj2, overwrite] = Array.from(input.getData('obj1', 'obj2', 'overwrite'));
    try {
      src = JSON.parse(JSON.stringify(overwrite ? obj1 : obj2));
      dst = JSON.parse(JSON.stringify(overwrite ? obj2 : obj1));
    } catch (e) {
      output.done(e);
      return;
    }
    for (const key in dst) {
      const val = dst[key];
      src[key] = val;
    }
    output.sendDone({ result: src });
  });
};
