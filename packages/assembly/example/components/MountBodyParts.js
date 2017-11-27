const Component = require('../../index');

class MountBodyParts extends Component {
  constructor() {
    super({
      description: 'Unified body part mounter',
      inPorts: {
        in: {
          datatype: 'object',
          description: 'Assembly',
        },
        partname: {
          datatype: 'string',
          description: 'Part name',
          control: true,
        },
      },
      validates: {
        body: 'obj',
        parts: 'obj',
      },
    });
  }
  handle(input, output) {
    if (!input.hasData('in', 'partname')) { return null; }

    const msg = input.getData('in');
    const partname = input.getData('partname');

    // Message validation is explicit if there are multiple inports
    if (!this.validate(msg)) {
      return output.sendDone(msg);
    }

    msg.body[partname] = msg.parts[partname];
    delete msg.parts[partname];

    return output.sendDone(msg);
  }
}

exports.getComponent = () => new MountBodyParts();
