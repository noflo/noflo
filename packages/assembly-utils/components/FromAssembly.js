const noflo = require('noflo');

exports.getComponent = () => {
  const c = new noflo.Component();
  c.description = 'Convert an assembly message to a regular NoFlo packet';
  c.inPorts.add('in', {
    datatype: 'object',
  });
  c.outPorts.add('out', {
    datatype: 'object',
  });
  c.outPorts.add('error', {
    datatype: 'object',
  });
  return c.process((input, output) => {
    if (!input.hasData('in')) {
      return;
    }
    const data = input.getData('in');
    if (data.errors && data.errors.length) {
      output.done(data.errors[0]);
      return;
    }
    output.sendDone({
      out: {
        ...data,
        errors: undefined,
      },
    });
  });
};
