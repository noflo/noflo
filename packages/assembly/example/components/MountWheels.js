const Component = require('../../index');

class MountWheels extends Component {
  constructor() {
    super({
      description: 'Mounts wheels',
      inPorts: {
        in: {
          datatype: 'object',
          description: 'Assembly',
        },
        count: {
          datatype: 'int',
          description: 'Number of wheels',
          control: true, // for simplicity of example graph
        },
      },
      validates: { chassis: 'obj' },
    });
  }
  handle(input, output) {
    if (!input.hasData('in', 'count')) { return null; }

    const msg = input.getData('in');
    const count = input.getData('count');

    if (!this.validate(msg)) {
      return output.sendDone(msg);
    }

    msg.chassis.wheels = [];
    for (let i = 0; i < count; i += 1) {
      msg.chassis.wheels.push('O');
    }

    return output.sendDone(msg);
  }
}

exports.getComponent = () => new MountWheels();
