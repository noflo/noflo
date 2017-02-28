import Component from '../../index';

export class MountSuspension extends Component {
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

export function getComponent() {
  return new MountSuspension({
    description: 'Mounts suspension',
  });
}
