const noflo = require('noflo');
const { merge } = require('noflo-assembly');

exports.getComponent = () => {
  const c = new noflo.Component();
  c.description = 'Merge assembly message from all connections';
  c.icon = 'angle-double-right';
  c.inPorts.add('in', {
    datatype: 'object',
    addressable: true,
  });
  c.outPorts.add('out', {
    datatype: 'object',
  });
  return c.process((input, output) => {
    const attachedIndexes = input.attached('in');
    const indexesWithData = attachedIndexes
      .filter((idx) => input.hasData(['in', idx]));
    if (indexesWithData.length < attachedIndexes.length) {
      // Still waiting for data
      return;
    }
    const messages = indexesWithData.map((idx) => input
      .getData(['in', idx]));
    let message = {};
    messages.forEach((msg) => {
      message = merge(message, msg);
    });
    output.sendDone({
      out: message,
    });
  });
};
