import { Component } from '../../../../src/lib/Component.js';

export function getComponent() {
  const c = new Component();
  c.description = 'Send string';
  c.inPorts.add('in', {
    datatype: 'bang',
  });
  c.inPorts.add('data', {
    datatype: 'string',
    control: true,
  });
  c.outPorts.add('out', {
    datatype: 'string',
  });
  c.process((input, output) => {
    if (!input.hasData('in', 'data')) {
      return;
    }
    const [data] = input.getData('data', 'in');
    output.sendDone({
      out: data,
    });
  });
  return c;
}
