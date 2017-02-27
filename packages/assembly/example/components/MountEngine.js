import Component, { fail } from '../../index';

export class MountEngine extends Component {
  constructor() {
    super({
      description: 'Mounts 3rd party engine on chassis',
      inPorts: {
        in: {
          datatype: 'object',
          description: 'Assembly',
        },
        engine: {
          datatype: 'string',
          description: 'Engine name',
          control: true, // for simplicity of example graph
        },
      },
      validates: { chassis: 'obj' },
    });
  }
  handle(input, output) {
    if (!input.hasData('in', 'engine')) { return null; }

    const msg = input.getData('in');
    const engine = input.getData('engine');

    // Message validation is explicit if there are multiple inports
    const errs = this.validate(msg);
    if (errs.length > 0) {
      return output.sendDone(fail(msg, errs));
    }

    msg.chassis.engine = engine;

    return output.sendDone(msg);
  }
}

export function getComponent() {
  return new MountEngine();
}
