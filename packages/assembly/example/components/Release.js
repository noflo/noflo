const Component = require('../../index');

const { failed } = Component;

class Release extends Component {
  constructor() {
    super({
      description: 'Release a car to the outer world',
      validates: ['chassis.id', 'body.id'],
    });
  }
  relay(msg, output) {
    // Display errors at this point
    if (failed(msg)) {
      msg.errors.forEach(e => console.error(e));
    } else {
      if (msg.parts) {
        delete msg.parts;
      }
      console.log('A Car:', JSON.stringify({
        chassis: msg.chassis,
        body: msg.body,
      }, null, 2));
    }
    output.sendDone(msg);
  }
}

exports.getComponent = () => new Release();
