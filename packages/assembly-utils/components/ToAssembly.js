const noflo = require('noflo');

exports.getComponent = () => {
  const c = new noflo.Component();
  c.description = 'Convert regular NoFlo data to an assembly message';
  c.inPorts.add('in', {
    datatype: 'any',
  });
  c.inPorts.add('error', {
    datatype: 'object',
  });
  c.outPorts.add('out', {
    datatype: 'object',
  });
  return c.process((input, output) => {
    if (input.hasData('in')) {
      const data = input.getData('in');
      output.sendDone({
        out: {
          errors: [],
          data,
        },
      });
      return;
    }
    if (input.hasData('error')) {
      const error = input.getData('error');
      output.sendDone({
        out: {
          errors: [
            error,
          ],
        },
      });
    }
  });
};
