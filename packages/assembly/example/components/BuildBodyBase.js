import Component from '../../index';

export class BuildBodyBase extends Component {
  constructor() {
    super({
      description: 'Builds the base of car body',
      validates: { id: 'num' },
    });
  }
  relay(msg, output) {
    msg.body = {
      id: msg.id,
    };
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new BuildBodyBase();
}
