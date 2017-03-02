import Component from '../../index';

export class SupplyBodyParts extends Component {
  constructor() {
    super({
      description: 'Example component with multiple ins and outs',
      inPorts: {
        in: {
          datatype: 'object',
          description: 'Assembly',
        },
        interior: {
          datatype: 'string',
          description: 'Complete interior',
          control: true,
        },
        doortype: {
          datatype: 'string',
          description: 'Door type/contents',
          control: true,
        },
        doornum: {
          datatype: 'int',
          description: 'Number of doors',
          control: true,
        },
      },
      outPorts: {
        main: {
          datatype: 'object',
          description: 'Primary output',
        },
        aux: {
          datatype: 'object',
          description: 'Secondary output',
        },
      },
      validates: {
        body: 'obj',
        'body.id': 'num',
      },
    });
  }
  handle(input, output) {
    if (!input.hasData('in', 'interior', 'doortype', 'doornum')) { return null; }

    const msg = input.getData('in');
    const interior = input.getData('interior');
    const doortype = input.getData('doortype');
    const doornum = input.getData('doornum');

    // Message validation is explicit if there are multiple inports
    if (!this.validate(msg)) {
      // Output must go to all branches expecting it regardless of error state
      return output.sendDone({
        main: msg,
        aux: msg,
      });
    }

    // Putting temporary supplies into the assembly carriage
    msg.parts = {
      interior,
      doors: [],
    };
    for (let i = 0; i < doornum; i += 1) {
      msg.parts.doors.push(doortype);
    }

    return output.sendDone({
      main: msg,
      aux: msg,
    });
  }
}

export function getComponent() {
  return new SupplyBodyParts();
}
