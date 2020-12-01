import { Component } from '../../../../lib/NoFlo';

exports.getComponent = (): Component => {
  const c = new Component();
  c.description = 'Repeat stuff';
  c.inPorts.add('in',
    { datatype: 'string' });
  c.outPorts.add('out',
    { datatype: 'string' });
  c.process((input, output) => {
    const data = input.getData('in');
    output.sendDone({ out: data });
  });
  return c;
};
