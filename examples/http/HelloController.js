// eslint-disable-next-line import/no-unresolved
const noflo = require('noflo');

exports.getComponent = () => {
  const c = new noflo.Component();
  c.description = 'Simple controller that says hello, user';
  c.inPorts.add('in',
    { datatype: 'object' });
  c.outPorts.add('out',
    { datatype: 'object' });
  c.outPorts.add('data',
    { datatype: 'object' });
  c.process((input, output) => {
    if (!input.hasData('in')) { return; }
    const request = input.getData('in');
    output.sendDone({
      out: request,
      data: {
        locals: {
          string: `Hello, ${request.req.remoteUser}`,
        },
      },
    });
  });
  return c;
};
