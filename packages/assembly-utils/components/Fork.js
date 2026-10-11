const noflo = require('noflo');
const { fork } = require('noflo-assembly');

exports.getComponent = () => {
  const c = new noflo.Component();
  c.description = 'Fork assembly message to all connections';
  c.icon = 'angle-double-left';
  c.inPorts.add('in', {
    datatype: 'object',
  });
  c.outPorts.add('out', {
    datatype: 'object',
    addressable: true,
  });
  return c.process((input, output) => {
    if (!input.hasData('in')) {
      return;
    }
    const message = input.getData('in');
    const attached = c.outPorts.ports.out.listAttached();
    attached.forEach((index) => {
      output.send({
        out: new noflo.IP('data', fork(message), {
          index,
        }),
      });
    });
    output.done();
  });
};
