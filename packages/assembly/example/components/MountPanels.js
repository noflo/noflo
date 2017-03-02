import Component from '../../index';

export class MountPanels extends Component {
  constructor() {
    super({
      description: 'Mounts body panels',
      validates: ['body.id'],
    });
  }
  relay(msg, output) {
    msg.body.panels = 'Steel Panels';
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new MountPanels();
}
