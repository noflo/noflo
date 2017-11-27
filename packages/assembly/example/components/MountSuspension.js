const Component = require('../../index');

class MountSuspension extends Component {
  // Can skip constructor
  relay(msg, output) {
    msg.chassis.suspension = {
      levers: '> | | <',
      shocks: ['I', 'I', 'i', 'i'],
      coils: ['Z', 'Z', 'z', 'z'],
    };
    output.sendDone(msg);
  }
}

exports.getComponent = () => new MountSuspension({
  description: 'Mounts suspension',
});
