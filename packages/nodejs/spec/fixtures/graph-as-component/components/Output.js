const noflo = require('noflo');

exports.getComponent = () => {
  const c = new noflo.Component();
  c.inPorts.add('in');
  c.outPorts.add('out');
  return c.process((input, output) => {
    console.log(input.getData('in'));
    output.done();
  });
};
