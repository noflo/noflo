// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
const noflo = require('../../../../src/lib/NoFlo');

exports.getComponent = function () {
  const c = new noflo.Component();
  c.description = 'Output stuff';
  c.inPorts.add('in',
    { datatype: 'string' });
  c.inPorts.add('out',
    { datatype: 'string' });
  c.process = function (input, output) {
    const data = input.getData('in');
    console.log(data);
    output.sendDone({ out: data });
  };
  return c;
};
