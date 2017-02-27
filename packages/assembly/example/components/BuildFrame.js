import Component from '../../index';

export class BuildFrame extends Component {
  constructor() {
    super({
      description: 'Builds car frame',
      validates: { id: 'num' },
      // Port definition is not necessary
    });
  }
  relay(msg, output) {
    msg.chassis = {
      id: msg.id,
      frame: 'Steel Frame',
    };
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new BuildFrame();
}
